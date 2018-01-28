import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as _ from 'lodash'
import * as path from 'path'

import Cache from './cache'

function topicsToArray(input: any, base?: string): Config.ITopic[] {
  if (!input) return []
  base = base ? `${base}:` : ''
  if (Array.isArray(input)) {
    return input.concat(_.flatMap(input, t => topicsToArray(t.subtopics, `${base}${t.name}`)))
  }
  return _.flatMap(Object.keys(input), k => {
    return [{...input[k], name: `${base}${k}`}].concat(topicsToArray(input[k].subtopics, `${base}${input[k].name}`))
  })
}

export async function topics(plugin: Config.IPlugin, lastUpdated: Date): Promise<Config.ITopic[]> {
  const cacheFile = path.join(plugin.config.cacheDir, 'topics', plugin.type, `${plugin.name}.json`)
  const cacheKey = [plugin.config.version, plugin.version, lastUpdated.toISOString()].join(':')
  const cache = new Cache<Config.ITopic[]>(cacheFile, cacheKey, 'topics')

  const pluginTopics = async () => {
    try {
      let topics: Config.ITopic[] = await cache.fetch('topics', async () => {
        if (!plugin.module) return []
        return plugin.module.topics
      })

      let pjsonTopics = plugin.config.pjson.dxcli.topics
      if (pjsonTopics) topics = topics.concat(topicsToArray(pjsonTopics))
      return topics
    } catch (err) {
      cli.warn(err)
      return []
    }
  }
  function topicsFromCommands() {
    for (let c of plugin.commands) {
      let name = c.id!.split(':').slice(0, -1).join(':')
      if (!plugin.topics.find(t => t.name === name)) {
        plugin.topics.push({name})
      }
    }
  }
  plugin.topics = await pluginTopics()
  topicsFromCommands()
  return plugin.topics
}
