import ManifestFile from '@dxcli/manifest-file'
import * as _ from 'lodash'
import * as path from 'path'

import {ICachedCommand, ICommand, IConfig, ITopic} from '@dxcli/config'

export type RunFn = (argv: string[], config: IConfig) => Promise<any>

export interface CacheTypes {
  topics: {
    input: ITopic[]
    output: ITopic[]
  }
  commands: {
    input: ICommand[]
    output: ICachedCommand[]
  }
}

export default class PluginCache extends ManifestFile {
  readonly cacheKey: string

  constructor(config: IConfig, {type, name, version}: {type: string, name: string, version: string}) {
    const file = path.join(config.cacheDir, 'plugin_cache', [type, `${name}.json`].join(path.sep))
    super(['@dxcli/load', name].join(':'), file)
    this.type = 'cache'
    this.cacheKey = [config.version, version].join(':')
  }

  async fetch<T extends keyof CacheTypes>(key: T, fn: () => Promise<CacheTypes[T]['input']>): Promise<CacheTypes[T]['output']> {
    await this.lock.add('read')
    try {
      let [persist, cacheKey] = await this.get<CacheTypes[T]['output'], string>(key, 'cache_key')
      if (persist && cacheKey && cacheKey === this.cacheKey) return persist
      this.debug('fetching', key)
      let input = await fn()
      try {
        await this.lock.add('write', {timeout: 200, reason: 'cache'})
        const persist = this.persist(key, input)
        await this.set(['cache_key', this.cacheKey], [key, persist])
        return persist
      } catch (err) {
        this.debug(err)
        return this.persist(key, input)
      } finally {
        await this.lock.remove('write')
      }
    } finally {
      await this.lock.remove('read')
    }
  }

  private persist<T extends keyof CacheTypes>(key: T, v: CacheTypes[T]['input']): CacheTypes[T]['output'] {
    const map: any = {
      commands: (commands: ICommand[]): ICachedCommand[] => {
        return commands.map(c => {
          return {
            _base: c._base,
            id: c.id,
            description: c.description,
            usage: c.usage,
            plugin: _.pick(c.plugin!, ['name', 'version', 'type', 'root']),
            hidden: c.hidden,
            aliases: c.aliases || [],
            help: c.help,
            load: async () => c,
          }
        })
      }
    }
    return key in map ? map[key](v) : v
  }
}
