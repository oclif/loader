import * as Config from '@dxcli/config'
import {CLI} from 'cli-ux'
import * as globby from 'globby'
import * as _ from 'lodash'
import * as path from 'path'

import Cache from './cache'
import * as Legacy from './legacy'

export interface ICachedCommand extends Config.ICachedCommand {
  id: string
  load(): Config.ICommand
}

export interface Plugin extends Config.IPlugin {
  pjson: Config.IPluginPJSON
  config: Config.IPluginConfig
  commandIDs: string[]
  commands: ICachedCommand[]
  topics: Config.ITopic[]
}

export async function load({config, root, name, type}: {config: Config.IConfig, root: string, name?: string, type: string}): Promise<Plugin> {
  const pluginConfig = await Config.PluginConfig.create({root, name})
  const pjson = pluginConfig.pjson
  name = pjson.name
  const version = pjson.version

  const debug = require('debug')(['@dxcli/load'].join(':'))
  const cli = new CLI(debug.namespace)
  debug(`loading from ${root}`)

  async function fetchModule(): Promise<Config.IPluginModule | undefined> {
    if (!pjson.main) return
    debug(`requiring ${pjson.name}@${pjson.version}`)

    const m: Config.IPluginModule = {
      commands: [],
      topics: [],
      ...require(path.join(root, pjson.main)),
    }

    if (m.topic) m.topics.push(m.topic)
    m.commands = m.commands.map(undefault)

    // await config.engine.hooks.run('plugins:parse', { module: m, pjson: plugin.pjson })

    const PluginLegacy: typeof Legacy.PluginLegacy = require('./legacy').PluginLegacy
    let legacy = new PluginLegacy()

    return legacy.convert(m)
  }
  const module = await fetchModule()

  async function fetchCommandIDs() {
    async function commandIDsFromModule(): Promise<string[]> {
      if (!module || !module.commands) return []
      return module.commands.map(m => {
        let id = m.id
        if (id) return id
        id = _.compact([(m as any).topic, (m as any).command]).join(':')
        try {
          m.id = id
        } catch {}
        return id
      })
    }

    async function commandIDsFromDir(): Promise<string[]> {
      function idFromPath(file: string) {
        const p = path.parse(file)
        const topics = p.dir.split(path.sep)
        let command = p.name !== 'index' && p.name
        return _([...topics, command]).compact().join(':')
      }

      if (!pluginConfig.commandsDir) return []
      debug(`loading IDs from ${pluginConfig.commandsDir}`)
      const files = await globby(['**/*.+(js|ts)', '!**/*.+(d.ts|test.ts|test.js)'], {
        nodir: true,
        cwd: pluginConfig.commandsDir,
      })
      return files.map(idFromPath)
    }

    return _(await Promise.all([commandIDsFromModule(), commandIDsFromDir()])).flatMap().value().sort()
  }

  const commandIDs = await fetchCommandIDs()
  debug('commandIDs dir: %s ids: %s', pluginConfig.commandsDir, commandIDs.join(' '))

  const cache = new Cache(config, {type, name, version})
  const plugin: Plugin = {
    name,
    version,
    type,
    pjson,
    root,
    commandIDs,
    commands: [],
    topics: [],
    config: pluginConfig,
  }

  plugin.commands = (await cache.fetch('commands', async (): Promise<Config.ICommand[]> => {
    debug('fetching commands')
    return _.compact(commandIDs.map(id => {
      try {
        return findCommand(id)
      } catch (err) {
        cli.warn(err)
      }
    }))
  })).map((cmd: Config.ICachedCommand): ICachedCommand => ({
    ...cmd,
    id: cmd.id!,
    load: () => findCommand(cmd.id!),
  }))

  function findCommand(id: string): Config.ICommand {
    let cmd = module && module.commands && module.commands.find(c => c.id === id)
    if (cmd) return cmd
    return findCommandInDir(id)
  }

  function commandPath(id: string): string {
    if (!pluginConfig.commandsDir) throw new Error('commandsDir not set')
    return require.resolve(path.join(pluginConfig.commandsDir, id.split(':').join(path.sep)))
  }

  function findCommandInDir(id: string): Config.ICommand {
    let c = undefault(require(commandPath(id)))
    if (!c.id) c.id = id
    c.plugin = plugin
    return c
  }

  async function topics(): Promise<Config.ITopic[]> {
    const pluginTopics = async () => {
      try {
        debug('fetching topics')
        let topics: Config.ITopic[] = await cache.fetch('topics', async () => {
          debug('fetching topics')
          if (!module) return []
          return module.topics
        })

        let pjsonTopics = pluginConfig.pjson.dxcli.topics
        if (pjsonTopics) topics = topics.concat(topicsToArray(pjsonTopics))
        return topics
      } catch (err) {
        cli.warn(err)
        return []
      }
    }
    function topicsFromCommands() {
      for (let c of plugin.commands) {
        let name = c.id!.split(':').slice(0, -1).join(':')
        if (!plugin.topics.find(t => t.name === name)) {
          plugin.topics.push({name})
        }
      }
    }
    plugin.topics = await pluginTopics()
    topicsFromCommands()
    return plugin.topics
  }
  plugin.topics = await topics()

  return plugin
}

interface IESModule<T> {
  __esModule: true
  default: T
}

function undefault<T>(obj: T | IESModule<T>): T {
  if ((obj as any).__esModule === true) return (obj as any).default
  return obj as any
}

function topicsToArray(input: any, base?: string): Config.ITopic[] {
  if (!input) return []
  base = base ? `${base}:` : ''
  if (Array.isArray(input)) {
    return input.concat(_.flatMap(input, t => topicsToArray(t.subtopics, `${base}${t.name}`)))
  }
  return _.flatMap(Object.keys(input), k => {
    return [{...input[k], name: `${base}${k}`}].concat(topicsToArray(input[k].subtopics, `${base}${input[k].name}`))
  })
}
