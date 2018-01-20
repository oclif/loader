import * as Config from '@dxcli/config'
import {expect} from 'chai'
import cli from 'cli-ux'
import * as fs from 'fs-extra'
import * as path from 'path'

import {load} from '../src'

const plugins: {
  [k: string]: {
    commandsDir?: string
    commandIDs: string[]
    command: any
    topic: any
  }
} = {
  // 'heroku-run': {
  //   commandIDs: [
  //     'console',
  //     'logs',
  //     'rake',
  //     'run',
  //     'run:detached',
  //     'run:inside',
  //   ],
  //   topic: {
  //     name: 'run',
  //     description: 'run a one-off process inside a Heroku dyno',
  //   },
  //   command: {
  //     id: 'run',
  //     description: 'run a one-off process inside a heroku dyno',
  //   },
  // },
  'heroku-cli-status': {
    commandsDir: './lib/commands',
    commandIDs: ['status'],
    topic: {
      name: 'status',
      description: 'status of the Heroku platform',
    },
    command: {
      id: 'status',
      description: 'display current status of the Heroku platform',
    }
  }
}

beforeEach(async () => {
  cli.config.debug = true
})

Object.entries(plugins).forEach(([name, test]) => {
  describe(name, () => {
    it('gets pjson', async () => {
      const plugin = await load({root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.config.pjson.dxcli.commands).to.equal(test.commandsDir)
      await fs.remove(plugin.config.cacheDir)
    })
    it('gets commandIDs', async () => {
      const plugin = await load({root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.commands.map(c => c.id)).to.have.members(test.commandIDs)
      await fs.remove(plugin.config.cacheDir)
    })
    it('gets a command', async () => {
      const plugin = await load({root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.commands.find(c => c.id === test.command.id)).to.nested.include(test.command)
      await fs.remove(plugin.config.cacheDir)
    })
    it('gets a topic', async () => {
      const plugin = await load({root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.topics.find(t => t.name === test.topic.name)).to.nested.include(test.topic)
      await fs.remove(plugin.config.cacheDir)
    })
  })
})

const testLoad = (name: string, description: string, fn: (plugin: Config.IPlugin) => void) => {
  it(description, async () => {
    const plugin = await load({root: __dirname, type: 'core', name})
    fn(plugin)
  })
}

describe('hooks', () => {
  testLoad('@dxcli/version', 'gets hooks from @dxcli/version', plugin => {
    expect(plugin.hooks.init).to.have.members([path.resolve(__dirname, '../node_modules/@dxcli/version/lib/hooks/init')])
  })
})
