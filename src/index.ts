import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as fs from 'fs-extra'
import * as globby from 'globby'
import * as _ from 'lodash'

import Cache from './cache'
import * as Commands from './commands'
import * as Module from './module'
import * as Topics from './topics'
import {undefault} from './util'

export interface LoadOptions {
  root?: string
  type?: string
  baseConfig?: Config.IConfig
  name?: string
  tag?: string
  resetCache?: boolean
}

export async function load(opts: LoadOptions = {}): Promise<Config.IPlugin> {
  const config = await Config.read(opts)
  const pjson = config.pjson
  const name = pjson.name
  const version = pjson.version
  const type = opts.type || 'core'

  const plugin: Config.IPlugin = {
    name,
    version,
    root: config.root,
    tag: opts.tag,
    type,
    config,
    hooks: {...config.hooks},
    commands: [],
    topics: [],
    plugins: [],
  }

  if (config.pluginsModule) {
    plugin.plugins = await undefault(require(config.pluginsModule))(config)
  } else if (_.isArray(pjson.dxcli.plugins)) {
    plugin.plugins = _.compact(await Promise.all<Config.IPlugin | undefined>(pjson.dxcli.plugins.map(async (p: string) => {
      try {
        return await load({baseConfig: config, root: config.root, type, name: p})
      } catch (err) {
        cli.warn(err)
      }
    })))
  }

  plugin.module = await Module.fetch(plugin, config.engine)
  const cache = new Cache(config, plugin, opts.resetCache ? new Date() : (await lastUpdated(plugin)))
  plugin.topics = (await Topics.topics(plugin, cache)).concat(...plugin.plugins.map(p => p.topics))
  plugin.commands = (await Commands.commands(plugin, cache)).concat(...plugin.plugins.map(p => p.commands))

  for (let p of plugin.plugins) {
    for (let [hook, hooks] of Object.entries(p.hooks)) {
      plugin.hooks[hook] = [...plugin.hooks[hook] || [], ...hooks]
    }
  }

  return plugin
}

async function lastUpdated(plugin: Config.IPlugin): Promise<Date> {
  try {
    let files = await globby([`${plugin.config.commandsDir}/**/*.+(js|ts)`, '!**/*.+(d.ts|test.ts|test.js)'], {nodir: true})
    files = files.concat(...Object.values(plugin.config.hooks))
    files = files.map(f => require.resolve(f))
    let stats = await Promise.all(files.map(f => fs.stat(f)))
    const max = _.maxBy(stats, 'mtime')
    if (!max) return new Date()
    return max.mtime
  } catch (err) {
    cli.warn(err)
    return new Date()
  }
}
