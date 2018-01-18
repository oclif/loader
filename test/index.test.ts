import {IConfig, PluginConfig} from '@dxcli/config'
import {describe, expect} from '@dxcli/dev-test'
import cli from 'cli-ux'
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
  'heroku-run': {
    commandIDs: [
      'console',
      'logs',
      'rake',
      'run',
      'run:detached',
      'run:inside',
    ],
    topic: {
      name: 'run',
      description: 'run a one-off process inside a Heroku dyno',
    },
    command: {
      id: 'run',
      description: 'run a one-off process inside a heroku dyno',
    },
  },
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

let config: IConfig

beforeEach(async () => {
  cli.config.debug = true
  config = await PluginConfig.create({root: __dirname})
})

Object.entries(plugins).forEach(([name, test]) => {
  describe(name, () => {
    it('gets pjson', async () => {
      const plugin = await load({config, root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.config.pjson.dxcli.commands).to.equal(test.commandsDir)
    })
    it('gets commandIDs', async () => {
      const plugin = await load({config, root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.commands.map(c => c.id)).to.deep.equal(test.commandIDs)
    })
    it('gets a command', async () => {
      const plugin = await load({config, root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.commands.find(c => c.id === test.command.id)).to.nested.include(test.command)
    })
    it('gets a topic', async () => {
      const plugin = await load({config, root: path.join(__dirname, '../plugins', name), type: 'user'})
      expect(plugin.topics.find(t => t.name === test.topic.name)).to.nested.include(test.topic)
    })
  })
})
