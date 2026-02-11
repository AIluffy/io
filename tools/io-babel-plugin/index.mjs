export default function ioAccessPlugin({ types: t }) {
  function isIoImport(path, state) {
    const node = path.node;
    if (!t.isImportDeclaration(node)) return;
    if (node.source.value !== 'io-store') return;
    for (const spec of node.specifiers) {
      if (t.isImportSpecifier(spec) && spec.imported.name === 'io') {
        state.ioNames.add(spec.local.name);
      }
    }
  }

  function isIoCallee(node, state) {
    return t.isIdentifier(node) && state.ioNames.has(node.name);
  }

  function collectChain(node) {
    const segments = [];
    let current = node;
    while (t.isMemberExpression(current)) {
      if (current.optional) return null;
      const prop = current.property;
      if (current.computed) {
        if (t.isStringLiteral(prop)) {
          segments.unshift(t.stringLiteral(prop.value));
        } else if (t.isNumericLiteral(prop)) {
          segments.unshift(t.numericLiteral(prop.value));
        } else {
          return null;
        }
      } else if (t.isIdentifier(prop)) {
        segments.unshift(t.stringLiteral(prop.name));
      } else {
        return null;
      }
      current = current.object;
    }
    return { root: current, segments };
  }

  function ensureHelper(path, state) {
    if (state.helperId) return state.helperId;
    const helperId = path.scope.generateUidIdentifier('__oin_get');
    state.helperId = helperId;
    state.shouldInsertHelper = true;
    return helperId;
  }

  return {
    name: 'io-access-chain',
    visitor: {
      Program: {
        enter(_path, state) {
          state.ioNames = new Set();
          state.ioBindings = new Set();
          state.shouldInsertHelper = false;
          state.helperId = null;
          state.didTransform = false;
        },
        exit(path, state) {
          if (!state.shouldInsertHelper || !state.helperId) return;
          const helperId = state.helperId;
          const body = [];
          const internalId = t.identifier('INTERNAL');

          body.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                internalId,
                t.callExpression(
                  t.memberExpression(t.identifier('Symbol'), t.identifier('for')),
                  [t.stringLiteral('io-store/internal')]
                )
              ),
            ])
          );

          body.push(
            t.variableDeclaration('let', [
              t.variableDeclarator(t.identifier('node'), t.identifier('root')),
            ])
          );

          body.push(
            t.forOfStatement(
              t.variableDeclaration('const', [
                t.variableDeclarator(t.identifier('segment')),
              ]),
              t.identifier('path'),
              t.blockStatement([
                t.ifStatement(
                  t.binaryExpression(
                    '==',
                    t.identifier('node'),
                    t.nullLiteral()
                  ),
                  t.returnStatement(t.identifier('node'))
                ),
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier('internal'),
                    t.memberExpression(
                      t.identifier('node'),
                      internalId,
                      true
                    )
                  ),
                ]),
                t.ifStatement(
                  t.logicalExpression(
                    '&&',
                    t.identifier('internal'),
                    t.binaryExpression(
                      '===',
                      t.memberExpression(t.identifier('internal'), t.identifier('kind')),
                      t.stringLiteral('scope')
                    )
                  ),
                  t.blockStatement([
                    t.variableDeclaration('const', [
                      t.variableDeclarator(
                        t.identifier('next'),
                        t.optionalCallExpression(
                          t.optionalMemberExpression(
                            t.identifier('internal'),
                            t.identifier('getChild'),
                            false,
                            true
                          ),
                          [t.identifier('segment')],
                          true
                        )
                      ),
                    ]),
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.identifier('node'),
                        t.logicalExpression(
                          '??',
                          t.identifier('next'),
                          t.memberExpression(
                            t.identifier('node'),
                            t.identifier('segment'),
                            true
                          )
                        )
                      )
                    ),
                    t.continueStatement(),
                  ])
                ),
                t.ifStatement(
                  t.logicalExpression(
                    '&&',
                    t.identifier('internal'),
                    t.binaryExpression(
                      '===',
                      t.memberExpression(t.identifier('internal'), t.identifier('kind')),
                      t.stringLiteral('array')
                    )
                  ),
                  t.blockStatement([
                    t.variableDeclaration('const', [
                      t.variableDeclarator(
                        t.identifier('next'),
                        t.optionalCallExpression(
                          t.optionalMemberExpression(
                            t.identifier('internal'),
                            t.identifier('getChild'),
                            false,
                            true
                          ),
                          [t.identifier('segment')],
                          true
                        )
                      ),
                    ]),
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.identifier('node'),
                        t.logicalExpression(
                          '??',
                          t.identifier('next'),
                          t.memberExpression(
                            t.identifier('node'),
                            t.identifier('segment'),
                            true
                          )
                        )
                      )
                    ),
                    t.continueStatement(),
                  ])
                ),
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.identifier('node'),
                    t.memberExpression(
                      t.identifier('node'),
                      t.identifier('segment'),
                      true
                    )
                  )
                ),
              ])
            )
          );

          body.push(t.returnStatement(t.identifier('node')));

          const helperFn = t.functionDeclaration(
            helperId,
            [t.identifier('root'), t.identifier('path')],
            t.blockStatement(body)
          );

          const programBody = path.node.body;
          let insertIndex = 0;
          for (let i = 0; i < programBody.length; i += 1) {
            if (t.isImportDeclaration(programBody[i])) insertIndex = i + 1;
          }
          programBody.splice(insertIndex, 0, helperFn);
        },
      },
      ImportDeclaration(path, state) {
        isIoImport(path, state);
      },
      VariableDeclarator(path, state) {
        const { id, init } = path.node;
        if (!t.isIdentifier(id) || !init) return;
        if (t.isCallExpression(init) && isIoCallee(init.callee, state)) {
          state.ioBindings.add(id.name);
        }
      },
      AssignmentExpression(path, state) {
        const { left, right } = path.node;
        if (!t.isIdentifier(left)) return;
        if (t.isCallExpression(right) && isIoCallee(right.callee, state)) {
          state.ioBindings.add(left.name);
        }
      },
      MemberExpression(path, state) {
        if (!state.ioBindings.size) return;
        if (path.parentPath.isMemberExpression() && path.parentPath.node.object === path.node)
          return;
        const collected = collectChain(path.node);
        if (!collected) return;

        const { root, segments } = collected;
        if (t.isIdentifier(root) && !state.ioBindings.has(root.name)) return;
        if (t.isCallExpression(root) && !isIoCallee(root.callee, state)) return;

        const helperId = ensureHelper(path, state);
        state.didTransform = true;
        path.replaceWith(t.callExpression(helperId, [root, t.arrayExpression(segments)]));
      },
    },
  };
}
