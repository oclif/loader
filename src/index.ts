import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as _ from 'lodash'
import * as path from 'path'

import Cache from './cache'
import * as Commands from './commands'
import * as Module from './module'
import * as Topics from './topics'
import {undefault} from './util'

export async function load({root, name, type, baseConfig}: {baseConfig?: Config.IConfig, root: string, name?: string, type: string}): Promise<Config.IPlugin> {
  const config = await Config.read({root, name, baseConfig})
  const pjson = config.pjson
  name = pjson.name
  const version = pjson.version

  const plugin: Config.IPlugin = {
    name,
    version,
    root: config.root,
    type,
    config,
    hooks: {...config.hooks},
    commands: [],
    topics: [],
    plugins: [],
  }

  const plugins = pjson.dxcli.plugins || []
  if (plugins) {
    if (typeof plugins === 'string') {
      plugin.plugins = undefault(require(path.join(pjson.root, plugins)))(config)
    } else {
      plugin.plugins = _.compact(await Promise.all<Config.IPlugin | undefined>(plugins.map(async (p: string) => {
        try {
          return await load({baseConfig: config, root: config.root, type, name: p})
        } catch (err) {
          cli.warn(err)
        }
      })))
    }
  }

  plugin.module = await Module.fetch(plugin, config.engine)
  const cache = new Cache(config, plugin)
  plugin.topics = (await Topics.topics(plugin, cache)).concat(...plugin.plugins.map(p => p.topics))
  plugin.commands = (await Commands.commands(plugin, cache)).concat(...plugin.plugins.map(p => p.commands))

  for (let p of plugin.plugins) {
    for (let [hook, hooks] of Object.entries(p.hooks)) {
      plugin.hooks[hook] = [...plugin.hooks[hook] || [], ...hooks]
    }
  }

  return plugin
}
