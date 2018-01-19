import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as _ from 'lodash'
import * as path from 'path'

import Cache from './cache'
import * as Commands from './commands'
import * as Module from './module'
import * as Topics from './topics'
import {undefault} from './util'

export interface Plugin extends Config.IPlugin {
  config: Config.IPluginConfig
  module?: Config.IPluginModule
  commands: Commands.ICachedCommand[]
  topics: Config.ITopic[]
  plugins: Plugin[]
}

export async function load({config, root, name, type}: {config: Config.IConfig, root: string, name?: string, type: string}): Promise<Plugin> {
  const pluginConfig = await Config.PluginConfig.create({root, name})
  const pjson = pluginConfig.pjson
  name = pjson.name
  const version = pjson.version

  const plugin: Plugin = {
    name,
    version,
    root: pluginConfig.root,
    type,
    config: pluginConfig,
    commands: [],
    topics: [],
    plugins: [],
  }

  if (pjson.plugins) {
    if (typeof pjson.plugins === 'string') {
      plugin.plugins = undefault(require(path.join(pjson.root, pjson.plugins)))(config)
    } else {
      plugin.plugins = _.compact(await Promise.all<Plugin>(pjson.plugins.map(async (p: string) => {
        try {
          return await load({config, root: config.root, type, name: p})
        } catch (err) {
          cli.warn(err)
        }
      })))
    }
  }

  plugin.module = await Module.fetch(plugin)
  const cache = new Cache(config, plugin)
  plugin.topics = (await Topics.topics(plugin, cache)).concat(...plugin.plugins.map(p => p.topics))
  plugin.commands = (await Commands.commands(plugin, cache)).concat(...plugin.plugins.map(p => p.commands))

  return plugin
}

export {ICachedCommand} from './commands'
