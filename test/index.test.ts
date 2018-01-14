import {describe, expect} from '@dxcli/dev-test'
import * as path from 'path'

import {load} from '../src'

const plugins: {
  [k: string]: {
    commandsDir?: string
    commandIDs: string[]
  }
} = {
  'heroku-run': {
    commandIDs: ['run'],
  },
  'heroku-cli-status': {
    commandsDir: './lib/commands',
    commandIDs: ['status'],
  }
}

Object.entries(plugins).forEach(([name, test]) => {
  describe(name, () => {
    it('gets pjson', async () => {
      const plugin = await load(path.join(__dirname, '../plugins', name))
      expect(plugin.pjson.dxcli.commands).to.equal(test.commandsDir)
    })
    it('gets commandIDs', async () => {
      const plugin = await load(path.join(__dirname, '../plugins', name))
      expect(plugin.commandIDs).to.deep.equal(test.commandIDs)
    })
  })
})
