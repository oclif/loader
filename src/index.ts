import * as fs from 'fs-extra'
import * as globby from 'globby'
import * as _ from 'lodash'
import * as path from 'path'
import * as readPkg from 'read-pkg'

import * as Legacy from './legacy'

export interface PluginModuleTopic {
  name: string
  description?: string
  subtopics?: { [k: string]: PluginModuleTopic }
  hidden?: boolean
}
export interface PluginModule {
  commands: any[]
  // commands: ICommand[]
  topic?: PluginModuleTopic
  topics: PluginModuleTopic[]
}

export interface PluginPJSON extends readPkg.Package {
  dxcli: {
    commands?: string
  }
}

export interface Plugin {
  root: string
  pjson: PluginPJSON
  commandIDs: string[]
}

interface TSConfig {
  compilerOptions: {
    rootDir?: string
    outDir?: string
  }
}

export async function load(root: string): Promise<Plugin> {
  const pjson: any = await readPkg(path.join(root, 'package.json'))
  if (!pjson.dxcli) pjson.dxcli = pjson['cli-engine'] || {}

  const debug = require('debug')(['@dxcli/load'].join(':'))
  debug(`loading from ${root}`)

  async function fetchCommandsDir(): Promise<string | undefined> {
    async function fetchTSConfig(root: string): Promise<TSConfig | undefined> {
      try {
        const tsconfig = await fs.readJSON(path.join(root, 'tsconfig.json'))
        return tsconfig.compilerOptions && tsconfig
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }

    let commandsDir = pjson.dxcli.commands
    if (!commandsDir) return
    commandsDir = path.join(root, commandsDir)
    let tsconfig = await fetchTSConfig(root)
    if (tsconfig) {
      debug('tsconfig.json found')
      let {rootDir, outDir} = tsconfig.compilerOptions
      if (rootDir && outDir) {
        try {
          debug('using ts files')
          require('ts-node').register()
          const lib = path.join(root, outDir)
          const src = path.join(root, rootDir)
          const relative = path.relative(lib, commandsDir)
          commandsDir = path.join(src, relative)
        } catch (err) {
          debug(err)
        }
      }
    }
    return commandsDir
  }

  const commandsDir = await fetchCommandsDir()

  async function fetchModule(): Promise<PluginModule | undefined> {
    if (!pjson.main) return
    debug(`requiring ${pjson.name}@${pjson.version}`)

    const m: PluginModule = {
      commands: [],
      topics: [],
      ...require(path.join(root, pjson.main!)),
    }

    if (m.topic) m.topics.push(m.topic)
    m.commands = m.commands.map(undefault)

    // await config.engine.hooks.run('plugins:parse', { module: m, pjson: plugin.pjson })

    const PluginLegacy: typeof Legacy.PluginLegacy = require('./legacy')
    let legacy = new PluginLegacy()

    return legacy.convert(m)
  }

  async function fetchCommandIDs() {
    async function commandIDsFromModule(): Promise<string[]> {
      const m = await fetchModule()
      if (!m || !m.commands) return []
      return m.commands.map(m => m.id)
    }

    async function commandIDsFromDir(): Promise<string[]> {
      function idFromPath(file: string) {
        const p = path.parse(file)
        const topics = p.dir.split(path.sep)
        let command = p.name !== 'index' && p.name
        return _([...topics, command]).compact().join(':')
      }

      if (!commandsDir) return []
      debug(`loading IDs from ${commandsDir}`)
      const files = await globby(['**/*.+(js|ts)', '!**/*.+(d.ts|test.ts|test.js)'], {
        nodir: true,
        cwd: commandsDir,
      })
      return files.map(idFromPath)
    }

    return _(await Promise.all([commandIDsFromModule(), commandIDsFromDir()])).flatMap().value()
  }

  const commandIDs = await fetchCommandIDs()
  debug('commandIDs dir: %s ids: %s', commandsDir, commandIDs.join(' '))

  return {
    pjson,
    root,
    commandIDs,
  }
}

interface IESModule<T> {
    __esModule: true
    default: T
}

function undefault<T>(obj: T | IESModule<T>): T {
  if ((obj as any).__esModule === true) return (obj as any).default
  return obj as any
}
