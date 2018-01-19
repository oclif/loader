import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as globby from 'globby'
import * as _ from 'lodash'
import * as path from 'path'

import {Plugin} from '.'
import Cache from './cache'
import {undefault} from './util'

export async function commands(plugin: Plugin, cache: Cache): Promise<Config.ICachedCommand[]> {
  const debug = require('debug')(['@dxcli/load', plugin.name].join(':'))

  async function fetchCommandIDs(): Promise<string[]> {
    function idFromPath(file: string) {
      const p = path.parse(file)
      const topics = p.dir.split(path.sep)
      let command = p.name !== 'index' && p.name
      return _([...topics, command]).compact().join(':')
    }

    let ids = ((plugin.module && plugin.module.commands) || []).map(c => c.id) as string[]

    if (!plugin.config.commandsDir) return ids
    debug(`loading IDs from ${plugin.config.commandsDir}`)
    const files = await globby(['**/*.+(js|ts)', '!**/*.+(d.ts|test.ts|test.js)'], {
      nodir: true,
      cwd: plugin.config.commandsDir,
    })
    ids = ids.concat(files.map(idFromPath))
    debug('commandIDs dir: %s ids: %s', plugin.config.commandsDir, ids.join(' '))
    return ids
  }

  function findCommand(id: string): Config.ICommand {
    function findCommandInDir(id: string): Config.ICommand {
      function commandPath(id: string): string {
        if (!plugin.config.commandsDir) throw new Error('commandsDir not set')
        return require.resolve(path.join(plugin.config.commandsDir, id.split(':').join(path.sep)))
      }

      let c = undefault(require(commandPath(id)))
      if (!c.id) c.id = id
      c.plugin = plugin
      return c
    }
    let cmd = plugin.module && plugin.module.commands && plugin.module.commands.find(c => c.id === id)
    if (cmd) return cmd
    return findCommandInDir(id)
  }

  return (await cache.fetch('commands', async (): Promise<Config.ICommand[]> => {
    debug('fetching commands')
    return _(await fetchCommandIDs())
      .map(id => {
        try {
          return findCommand(id)
        } catch (err) { cli.warn(err) }
      })
      .compact()
      .value()
  }))
    .map((cmd: Config.ICachedCommand): Config.ICachedCommand => ({
      ...cmd,
      id: cmd.id,
      load: async () => findCommand(cmd.id),
    }))
}
