import * as TSNode from 'ts-node'

export function registerTSNode(debug: any, root: string) {
  debug('registering ts-node at', root)
  const tsNode: typeof TSNode = require('ts-node')
  tsNode.register({
    project: false,
    // cache: false,
    // typeCheck: true,
    compilerOptions: {
      target: 'esnext',
      module: 'commonjs',
      rootDirs: [`${root}/src`],
      typeRoots: [`${__dirname}/../node_modules/@types`],
    }
  })
}
