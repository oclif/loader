/* tslint:disable */
// import * as Config from '@dxcli/config'
// import * as path from 'path'

// import {undefault} from './util'

// export async function fetch(plugin: Config.IPlugin, engine?: Config.IEngine): Promise<Config.IPluginModule | undefined> {
//   if (!plugin.config.pjson.main) return

//   const m: Config.IPluginModule = {
//     commands: [],
//     topics: [],
//     ...require(path.join(plugin.config.root, plugin.config.pjson.main)),
//   }

//   if (m.topic) m.topics.push(m.topic)
//   m.commands = m.commands.map(undefault)

//   if (engine) await engine.runHook('plugins:parse', {module: m, plugin})

//   return m
// }
