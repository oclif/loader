import * as Config from '@dxcli/config'
import * as path from 'path'

import {Plugin} from '.'
import * as Legacy from './legacy'
import {undefault} from './util'

export async function fetch(plugin: Plugin): Promise<Config.IPluginModule | undefined> {
  if (!plugin.config.pjson.main) return

  const m: Config.IPluginModule = {
    commands: [],
    topics: [],
    ...require(path.join(plugin.config.root, plugin.config.pjson.main)),
  }

  if (m.topic) m.topics.push(m.topic)
  m.commands = m.commands.map(undefault)

  // await config.engine.hooks.run('plugins:parse', { module: m, pjson: plugin.pjson })

  const PluginLegacy: typeof Legacy.PluginLegacy = require('./legacy').PluginLegacy
  let legacy = new PluginLegacy()

  return legacy.convert(m)
}
