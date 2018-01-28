import {convertToCached} from '@dxcli/command'
import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as globby from 'globby'
import * as _ from 'lodash'
import * as path from 'path'
import * as TSNode from 'ts-node'

import Cache from './cache'
import {undefault} from './util'

export async function commands(plugin: Config.IPlugin, lastUpdated: Date): Promise<Config.ICachedCommand[]> {
  function getCached(c: Config.ICommand, id?: string): Config.ICachedCommand {
    if (id) c.id = id
    c.pluginName = plugin.name
    if (c.convertToCached) return c.convertToCached()
    return convertToCached(c)
  }

  const debug = require('debug')(['@dxcli/load', plugin.name].join(':'))
  const cacheFile = path.join(plugin.config.cacheDir, 'commands', plugin.type, `${plugin.name}.json`)
  const cacheKey = [plugin.config.version, plugin.version, lastUpdated.toISOString()].join(':')
  const cache = new Cache<Config.ICachedCommand[]>(cacheFile, cacheKey, plugin.name)

  async function fetchFromDir(dir: string, ts: boolean) {
    if (ts) {
      debug('loading ts commands')
      const tsNode: typeof TSNode = require('ts-node')
      tsNode.register({project: false, cache: false, typeCheck: true,
        compilerOptions: {
          target: 'esnext',
          module: 'commonjs',
          rootDirs: [`${plugin.root}/src`],
          typeRoots: [`${plugin.root}/node_modules/@types`],
        }
      })
    }

    async function fetchCommandIDs(): Promise<string[]> {
      function idFromPath(file: string) {
        const p = path.parse(file)
        const topics = p.dir.split(path.sep)
        let command = p.name !== 'index' && p.name
        return _([...topics, command]).compact().join(':')
      }

      debug(`loading IDs from ${dir}`)
      const files = await globby(['**/*.+(js|ts)', '!**/*.+(d.ts|test.ts|test.js)'], {cwd: dir})
      let ids = files.map(idFromPath)
      debug('commandIDs dir: %s ids: %s', dir, ids.join(' '))
      return ids
    }

    function findCommand(id: string): Config.ICommand {
      function findCommandInDir(id: string): Config.ICommand {
        function commandPath(id: string): string {
          return require.resolve(path.join(dir, ...id.split(':')))
        }
        debug('fetching %s from %s', id, dir)
        const p = commandPath(id)
        let c = undefault(require(p))
        return c
      }
      return findCommandInDir(id)
    }

    return (await cache.fetch('commands', async (): Promise<Config.ICachedCommand[]> => {
      const commands = (await fetchCommandIDs())
        .map(id => {
          try {
            return getCached(findCommand(id), id)
          } catch (err) { cli.warn(err) }
        })
      return _.compact(commands)
    }))
      .map((cmd: Config.ICachedCommand): Config.ICachedCommand => ({
        ...cmd,
        load: async () => findCommand(cmd.id),
      }))
  }

  let commands: Config.ICachedCommand[] = []
  if (plugin.config.commandsDirTS) {
    try {
      commands.push(...await fetchFromDir(plugin.config.commandsDirTS, true))
    } catch (err) {
      cli.warn(err)
      // debug(err)
    }
  }
  if (plugin.config.commandsDir) commands.push(...await fetchFromDir(plugin.config.commandsDir, false))
  if (plugin.module) {
    commands.push(...(plugin.module.commands || []).map(c => getCached(c)))
  }
  return commands
}
