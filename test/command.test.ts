import {read} from '@dxcli/config'
import {expect, fancy} from 'fancy-test'
import * as fs from 'fs-extra'
import * as path from 'path'

import {load} from '../src'

const root = path.join(__dirname, 'fixtures/typescript')

describe('hooks', () => {
  fancy
  .do(async () => {
    await fs.outputFile(path.join(root, '.git'), '')
    const config = await read({root})
    await fs.remove(config.cacheDir)
    await fs.remove(config.dataDir)
  })
  .stdout()
  .it('loads a TS command', async ctx => {
    const plugin = await load({root})
    const cmd = await plugin.commands[0].load()
    await cmd.run([])
    expect(ctx.stdout).to.equal('loading plugins\nit works!\n')
  })
})
