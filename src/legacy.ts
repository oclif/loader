import * as Config from '@dxcli/config'
import {args as Args} from '@dxcli/parser'
import {color} from '@heroku-cli/color'
import Command, {flags as Flags, vars} from '@heroku-cli/command'
import * as _ from 'lodash'
import * as semver from 'semver'
import {inspect} from 'util'

export interface ILegacyTopic {
  id?: string
  name?: string
  topic?: string
}

export interface ILegacyContext {
  version: string
  supportsColor: boolean
  auth: {
    password?: string
  }
  debug: boolean
  debugHeaders: boolean
  flags: { [k: string]: string }
  args: string[] | { [k: string]: string }
  app?: string
  org?: string
  team?: string
  config: Command['config']
  apiUrl: string
  herokuDir: string
  apiToken?: string
  apiHost: string
  gitHost: string
  httpGitHost: string
  cwd: string
}

export interface IFlowCommand {
  id: string
  _version: string
}

export type LegacyCommand = IV5Command | IFlowCommand

export type AnyTopic = ILegacyTopic
export type AnyCommand = Config.ICommand | LegacyCommand

export interface IV5Command {
  topic: string
  command?: string
  aliases?: string[]
  variableArgs?: boolean
  args: Args.IArg[]
  flags: ILegacyFlag[]
  description?: string
  help?: string
  usage?: string
  needsApp?: boolean
  wantsApp?: boolean
  needsAuth?: boolean
  needsOrg?: boolean
  wantsOrg?: boolean
  hidden?: boolean
  default?: boolean
  run(ctx: ILegacyContext): Promise<any>
}

export interface ILegacyModule {
  topics: AnyTopic[]
  commands: AnyCommand[]
}

export interface ILegacyFlag {
  name: string
  description?: string
  char?: string
  hasValue?: boolean
  hidden?: boolean
  required?: boolean
  optional?: boolean
  parse?: any
}

const debug = require('debug')('cli:legacy')

export class PluginLegacy {
  public convert(m: Config.IPluginModule | ILegacyModule): Config.IPluginModule {
    m.commands = this.convertCommands(m.commands)
    return m as Config.IPluginModule
  }

  private convertCommands(c: AnyCommand[]): Config.ICommand[] {
    return c.map(c => this.convertCommand(c))
  }

  private convertCommand(c: AnyCommand): Config.ICommand {
    if (this.isICommand(c)) return this.convertFromICommand(c)
    if (this.isV5Command(c)) return this.convertFromV5(c)
    if (this.isFlowCommand(c)) return this.convertFromFlow(c)
    debug(c)
    throw new Error(`Invalid command: ${inspect(c)}`)
  }

  private convertFromICommand(c: any): Config.ICommand {
    if (!c.id) c.id = _([c.topic, c.command]).compact().join(':')
    return c
  }

  private convertFromFlow(c: any): Config.ICommand {
    if (!c.id) c.id = _([c.topic, c.command]).compact().join(':')
    c._version = c._version || '0.0.0'
    return c
  }

  private convertFromV5(c: IV5Command): Config.ICommand {
    class V5 extends Command {
      static id = _([c.topic, c.command]).compact().join(':')
      static description = c.description
      static hidden = !!c.hidden
      static args = (c.args || []).map(a => ({
        ...a,
        required: a.required !== false && !(a as any).optional,
      }))
      static flags = convertFlagsFromV5(c.flags)
      static variableArgs = !!c.variableArgs
      static help = c.help
      static aliases = c.aliases || []
      static usage = c.usage

      async run() {
        const ctx: ILegacyContext = {
          version: this.config.userAgent,
          supportsColor: color.enabled,
          auth: {},
          debug: !!this.config.debug,
          debugHeaders: this.config.debug > 1 || ['1', 'true'].includes((process as any).env.HEROKU_DEBUG_HEADERS),
          flags: this.flags,
          args: c.variableArgs ? this.argv : this.args,
          app: this.flags.app,
          org: this.flags.org,
          team: this.flags.team,
          config: this.config,
          apiUrl: vars.apiUrl,
          herokuDir: this.config.cacheDir,
          apiToken: this.heroku.auth,
          apiHost: vars.apiHost,
          gitHost: vars.gitHost,
          httpGitHost: vars.httpGitHost,
          cwd: process.cwd(),
        }
        ctx.auth.password = ctx.apiToken
        const ansi = require('ansi-escapes')
        process.once('exit', () => {
          if (process.stderr.isTTY) {
            process.stderr.write(ansi.cursorShow)
          }
        })
        return c.run(ctx)
      }
    }

    if (c.needsApp || c.wantsApp) {
      V5.flags.app = Flags.app({required: !!c.needsApp})
      V5.flags.remote = Flags.remote()
    }
    if (c.needsOrg || c.wantsOrg) {
      let opts = {required: !!c.needsOrg, hidden: false, description: 'organization to use'}
      V5.flags.org = Flags.org(opts)
    }
    return V5 as any
  }

  private isICommand(command: any): command is Config.ICommand {
    if (!command._version) return false
    return semver.gte(command._version, '11.0.0')
  }

  private isV5Command(command: any): command is IV5Command {
    let c = command
    return !!(typeof c === 'object')
  }

  private isFlowCommand(command: AnyCommand): command is IFlowCommand {
    let c = command
    return typeof c === 'function'
    // if (c._version && deps.semver.lt(c._version, '11.0.0')) return true
  }
}

function convertFlagsFromV5(flags: ILegacyFlag[] | Flags.Input | undefined): Flags.Input {
  if (!flags) return {}
  if (!Array.isArray(flags)) return flags
  return flags.reduce(
    (flags, flag) => {
      let opts = {
        char: flag.char,
        description: flag.description,
        hidden: flag.hidden,
        required: flag.required || flag.optional === false,
        parse: flag.parse,
      }
      for (let [k, v] of Object.entries(opts)) {
        if (v === undefined) delete (opts as any)[k]
      }
      if (!opts.parse) delete opts.parse
      flags[flag.name] = flag.hasValue ? Flags.string(opts as any) : Flags.boolean(opts as any)
      return flags
    },
    {} as Flags.Input,
  )
}
