import * as Config from '@dxcli/config'
import cli from 'cli-ux'
import * as _ from 'lodash'

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

export async function topics(plugin: Config.IPlugin, cache: Cache): Promise<Config.ITopic[]> {
  const debug = require('debug')(['@dxcli/load', plugin.name].join(':'))
  const pluginTopics = async () => {
    try {
      debug('fetching topics')
      let topics: Config.ITopic[] = await cache.fetch('topics', async () => {
        debug('fetching topics')
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
