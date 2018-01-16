import * as Config from '@dxcli/config'
import * as globby from 'globby'
import * as _ from 'lodash'
import * as path from 'path'

import * as Legacy from './legacy'

export interface Plugin extends Config.IPlugin {
  pjson: Config.IPluginPJSON
  config: Config.IPluginConfig
  commandIDs: string[]
}

export async function load({root, name, type}: {root: string, name?: string, type: string}): Promise<Plugin> {
  const config = await Config.PluginConfig.create({root, name})
  const pjson = config.pjson

  const debug = require('debug')(['@dxcli/load'].join(':'))
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

  async function fetchCommandIDs() {
    async function commandIDsFromModule(): Promise<string[]> {
      const m = await fetchModule()
      if (!m || !m.commands) return []
      return m.commands.map(m => {
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

      if (!config.commandsDir) return []
      debug(`loading IDs from ${config.commandsDir}`)
      const files = await globby(['**/*.+(js|ts)', '!**/*.+(d.ts|test.ts|test.js)'], {
        nodir: true,
        cwd: config.commandsDir,
      })
      return files.map(idFromPath)
    }

    return _(await Promise.all([commandIDsFromModule(), commandIDsFromDir()])).flatMap().value().sort()
  }

  const commandIDs = await fetchCommandIDs()
  debug('commandIDs dir: %s ids: %s', config.commandsDir, commandIDs.join(' '))

  return {
    name: config.name,
    version: config.version,
    type,
    pjson,
    root,
    commandIDs,
    config,
  }
}

interface IESModule<T> {
    __esModule: true
    default: T
}

function undefault<T>(obj: T | IESModule<T>): T {
  if ((obj as any).__esModule === true) return (obj as any).default
  return obj as any
}
