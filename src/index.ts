import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as fs from 'fs-extra'
import * as globby from 'globby'
import * as _ from 'lodash'
import * as path from 'path'

import * as Commands from './commands'
import * as Module from './module'
import * as Topics from './topics'
import {undefault} from './util'

const loaderPjson = require('../package.json')

export interface LoadOptions {
  root?: string
  type?: string
  baseConfig?: Config.IConfig
  config?: Config.IConfig
  name?: string
  tag?: string
  resetCache?: boolean
}

export async function load(opts: LoadOptions = {}): Promise<Config.IPlugin> {
  const config = opts.config || await Config.read(opts)
  const pjson = config.pjson
  const name = pjson.name
  const debug = require('debug')(['@dxcli/load', name].join(':'))
  const version = pjson.version
  const type = opts.type || 'core'

  debug(loaderPjson.name, loaderPjson.version)

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

  async function getNewestCommand(plugin: Config.IPlugin): Promise<Date> {
    try {
      if (!await fs.pathExists(path.join(plugin.root, '.git'))) return new Date(0)
      let files = await globby([`${plugin.root}/+(src|lib)/**/*.+(js|ts)`, '!**/*.+(d.ts|test.ts|test.js)'])
      let stats = await Promise.all(files.map(async f => {
        const stat = await fs.stat(f)
        return [f, stat] as [string, fs.Stats]
      }))
      const max = _.maxBy(stats, '[1].mtime')
      if (!max) return new Date()
      debug('most recently updated file: %s %o', max[0], max[1].mtime)
      return max[1].mtime
    } catch (err) {
      cli.warn(err)
      return new Date()
    }
  }

  plugin.module = await Module.fetch(plugin, config.engine)
  const lastUpdated = opts.resetCache ? new Date() : await getNewestCommand(plugin)
  plugin.topics = (await Topics.topics(plugin, lastUpdated)).concat(...plugin.plugins.map(p => p.topics))
  plugin.commands = (await Commands.commands(plugin, lastUpdated)).concat(...plugin.plugins.map(p => p.commands))

  for (let p of plugin.plugins) {
    for (let [hook, hooks] of Object.entries(p.hooks)) {
      plugin.hooks[hook] = [...plugin.hooks[hook] || [], ...hooks]
    }
  }

  return plugin
}
