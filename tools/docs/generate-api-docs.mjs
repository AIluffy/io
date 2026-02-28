import fs from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript';

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, 'apps', 'docs', 'src', 'content', 'docs');
const packagesRoot = path.join(repoRoot, 'packages');

const LOCALES = [
  {
    id: 'en',
    contentDir: 'en',
    labels: {
      title: 'Reference',
      signature: 'Signature',
      parameters: 'Parameters',
      properties: 'Properties',
      returns: 'Returns',
      errors: 'Errors',
      source: 'Source',
      whenToUse: 'When to Use',
      example: 'Minimal Example',
      pitfalls: 'Common Pitfalls',
      related: 'Related APIs',
      indexTitle: 'API Reference',
      experimentalTitle: 'Experimental (@iostore/store/experimental)',
      experimentalNote: '**Experimental**: import from `@iostore/store/experimental`.',
      none: '(none)',
      noRelated: '- No related exports in this package.',
      packageDescription: (packageName) => `Exports available in ${packageName}.`,
      kindDescription: {
        function: 'Function API reference.',
        class: 'Class API reference.',
        interface: 'Interface API reference.',
        type: 'Type API reference.',
        enum: 'Enum API reference.',
        value: 'Value export reference.',
        unknown: 'API reference.',
      },
      whenToUseByKind: {
        function: 'Use this function when you need this behavior from the package API.',
        class: 'Use this class when you need an object with lifecycle/stateful behavior.',
        interface: 'Use this interface to type contracts between modules.',
        type: 'Use this type alias to model reusable type shapes.',
        enum: 'Use this enum when you need a constrained set of named values.',
        value: 'Use this exported value as a shared constant or runtime capability.',
        unknown: 'Use this export according to its package-level intent.',
      },
      pitfallsByKind: {
        function: [
          '- Validate argument types and nullability before calling.',
          '- Confirm import path and runtime environment (server/client) expectations.',
        ],
        class: [
          '- Prefer explicit construction over ad-hoc object literals.',
          '- Release subscriptions/resources created by class instances.',
        ],
        interface: [
          '- Keep interface shape aligned with runtime data.',
          '- Avoid using interfaces as runtime validation.',
        ],
        type: [
          '- Avoid over-expanding complex aliases in user-facing docs.',
          '- Keep aliases stable to prevent downstream type breakage.',
        ],
        enum: [
          '- Handle unknown values safely when reading external input.',
          '- Keep serialized enum values stable across versions.',
        ],
        value: [
          '- Treat exported values as read-only unless docs explicitly say otherwise.',
          '- Avoid mutating shared references across modules.',
        ],
        unknown: [
          '- Verify usage from source and tests when docs are minimal.',
          '- Prefer explicit imports from documented entry points.',
        ],
      },
    },
  },
  {
    id: 'zh-cn',
    contentDir: '',
    labels: {
      title: '参考',
      signature: '签名',
      parameters: '参数',
      properties: '属性',
      returns: '返回',
      errors: '错误',
      source: '源码',
      whenToUse: '何时使用',
      example: '最小示例',
      pitfalls: '常见误用',
      related: '相关 API',
      indexTitle: 'API 参考',
      experimentalTitle: '实验特性（@iostore/store/experimental）',
      experimentalNote: '**实验特性**：请从 `@iostore/store/experimental` 引入。',
      none: '（无）',
      noRelated: '- 当前包中暂无可推荐的相关导出。',
      packageDescription: (packageName) => `${packageName} 的导出 API 列表。`,
      kindDescription: {
        function: '函数 API 参考。',
        class: '类 API 参考。',
        interface: '接口 API 参考。',
        type: '类型 API 参考。',
        enum: '枚举 API 参考。',
        value: '值导出 API 参考。',
        unknown: 'API 参考。',
      },
      whenToUseByKind: {
        function: '当你需要该包提供的这项行为能力时使用此函数。',
        class: '当你需要带生命周期或状态封装的对象能力时使用此类。',
        interface: '当你需要约束模块间类型契约时使用此接口。',
        type: '当你需要复用类型结构时使用此类型别名。',
        enum: '当你需要一组受限且可读的命名值时使用此枚举。',
        value: '当你需要共享常量或运行时能力时使用此导出值。',
        unknown: '当你需要该导出提供的能力时使用，必要时结合源码确认。',
      },
      pitfallsByKind: {
        function: [
          '- 调用前请确认参数类型与可空性约束。',
          '- 注意导入路径与运行环境（服务端/客户端）是否匹配。',
        ],
        class: [
          '- 优先使用显式构造，避免用对象字面量“模拟”实例。',
          '- 及时释放实例创建的订阅或资源。',
        ],
        interface: [
          '- 保持接口定义与真实运行时数据一致。',
          '- 不要把接口当作运行时校验手段。',
        ],
        type: [
          '- 避免在用户文档中展开过于复杂的类型细节。',
          '- 调整类型别名时注意下游兼容性。',
        ],
        enum: [
          '- 处理外部输入时为未知值留出兜底分支。',
          '- 保持序列化值稳定，避免破坏兼容性。',
        ],
        value: [
          '- 除非文档明确说明，否则将导出值视为只读。',
          '- 避免跨模块直接修改共享引用。',
        ],
        unknown: [
          '- 文档信息不足时，请结合源码与测试确认行为。',
          '- 优先使用文档声明的入口路径进行导入。',
        ],
      },
    },
  },
];

const TYPE_FLAGS = ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const MAX_TYPE_TEXT_LENGTH = 320;
const DOCS_DIR_OVERRIDES = {
  '@iostore/store': {
    query: { dirName: 'io-query', packageName: '@iostore/store/query' },
  },
};

function kebabCase(input) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function cleanupStaleExportDirs(pkgDir, validSlugs) {
  const entries = await fs.readdir(pkgDir, { withFileTypes: true });
  const valid = new Set(validSlugs);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (valid.has(entry.name)) continue;
    await fs.rm(path.join(pkgDir, entry.name), { recursive: true, force: true });
  }
}

async function cleanupStalePackageDirs(apiReferenceDir, validPackageDirs) {
  const entries = await fs.readdir(apiReferenceDir, { withFileTypes: true });
  const valid = new Set(validPackageDirs);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (valid.has(entry.name)) continue;
    await fs.rm(path.join(apiReferenceDir, entry.name), { recursive: true, force: true });
  }
}

function normalizeTypeText(text) {
  const normalized = text
    .replace(/import\(".*?"\)\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= MAX_TYPE_TEXT_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_TYPE_TEXT_LENGTH - 1)}…`;
}

function renderExportDescription(labels, exportKind) {
  return labels.kindDescription[exportKind] ?? labels.kindDescription.unknown;
}

function toTagText(tagText) {
  if (!tagText) return '';
  if (typeof tagText === 'string') return tagText.trim();
  if (Array.isArray(tagText)) return tagText.map((part) => part.text ?? '').join('').trim();
  return '';
}

function getSymbolDocs(checker, symbol) {
  const docs = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  return docs.length > 0 ? docs : '';
}

function getThrowsEntries(symbol) {
  return symbol
    .getJsDocTags()
    .filter((tag) => tag.name === 'throws' || tag.name === 'throw')
    .map((tag) => toTagText(tag.text))
    .filter((text) => text.length > 0);
}

function createProgram(entryFile) {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    resolveJsonModule: true,
    esModuleInterop: true,
    skipLibCheck: true,
    allowJs: false,
    strict: false,
    noEmit: true,
    baseUrl: repoRoot,
    types: [],
  };

  const host = ts.createCompilerHost(options, true);
  const program = ts.createProgram([entryFile], options, host);
  return { program, checker: program.getTypeChecker() };
}

function getModuleExports(checker, sourceFile) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return [];
  return checker.getExportsOfModule(moduleSymbol);
}

function getSymbolDeclPath(symbol) {
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!decl) return null;
  const sourceFile = decl.getSourceFile();
  const fileName = sourceFile.fileName;
  if (!path.isAbsolute(fileName)) return fileName;
  return path.relative(repoRoot, fileName);
}

function resolveExportSymbol(checker, exportedSymbol) {
  if (exportedSymbol.flags & ts.SymbolFlags.Alias) {
    return checker.getAliasedSymbol(exportedSymbol);
  }
  return exportedSymbol;
}

function getSignature(checker, symbol) {
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!decl) return null;

  const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  const signatures = type.getCallSignatures();
  if (signatures.length === 0) return null;

  const signature = signatures[0];
  const signatureTextRaw = checker.signatureToString(
    signature,
    decl,
    TYPE_FLAGS | ts.TypeFormatFlags.WriteArrowStyleSignature
  );
  const params = signature.getParameters().map((p) => {
    const pDecl = p.valueDeclaration ?? p.declarations?.[0] ?? decl;
    const pTypeRaw = checker.typeToString(
      checker.getTypeOfSymbolAtLocation(p, pDecl),
      pDecl,
      TYPE_FLAGS
    );
    return { name: p.getName(), type: normalizeTypeText(pTypeRaw) };
  });
  const returnTypeRaw = checker.typeToString(
    signature.getReturnType(),
    decl,
    TYPE_FLAGS
  );

  return {
    signatureText: normalizeTypeText(signatureTextRaw),
    params,
    returnType: normalizeTypeText(returnTypeRaw),
  };
}

function getDeclaredType(checker, symbol) {
  const decl = symbol.declarations?.[0];
  if (!decl) return null;
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const typeTextRaw = checker.typeToString(type, decl, TYPE_FLAGS);
  const shouldRenderProperties =
    ts.isInterfaceDeclaration(decl) ||
    ts.isClassDeclaration(decl) ||
    (ts.isTypeAliasDeclaration(decl) && ts.isTypeLiteralNode(decl.type));

  const properties = shouldRenderProperties
    ? type.getProperties().map((p) => {
        const pDecl = p.valueDeclaration ?? p.declarations?.[0] ?? decl;
        const pTypeRaw = checker.typeToString(
          checker.getTypeOfSymbolAtLocation(p, pDecl),
          pDecl,
          TYPE_FLAGS
        );
        return { name: p.getName(), type: normalizeTypeText(pTypeRaw) };
      })
    : [];
  return { typeText: normalizeTypeText(typeTextRaw), properties };
}

function getExportKind(symbol) {
  const hasCall = !!(
    symbol.valueDeclaration && ts.isFunctionLike(symbol.valueDeclaration)
  );
  if (hasCall) return 'function';

  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!decl) return 'unknown';

  if (ts.isFunctionDeclaration(decl)) return 'function';
  if (ts.isClassDeclaration(decl)) return 'class';
  if (ts.isInterfaceDeclaration(decl)) return 'interface';
  if (ts.isTypeAliasDeclaration(decl)) return 'type';
  if (ts.isEnumDeclaration(decl)) return 'enum';
  return 'value';
}

function renderFrontmatter({ title, description, extra }) {
  const safeTitle = title ?? '';
  const safeDescription = description ?? '';
  const extraBlock = extra ? `\n${extra}` : '';
  return `---\ntitle: ${JSON.stringify(
    safeTitle
  )}\ndescription: ${JSON.stringify(safeDescription)}${extraBlock}\n---\n`;
}

function escapeMarkdownTableCell(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

function renderParamsTable(params, labels) {
  if (!params || params.length === 0)
    return `\n## ${labels.parameters}\n\n${labels.none}\n`;
  const rows = params
    .map((p) => {
      const safeName = escapeMarkdownTableCell(p.name);
      const safeType = escapeMarkdownTableCell(p.type);
      return `| ${safeName} | \`${safeType}\` |`;
    })
    .join('\n');
  return `\n## ${labels.parameters}\n\n| Name | Type |\n| --- | --- |\n${rows}\n`;
}

function renderPropertiesTable(properties, labels) {
  if (!properties || properties.length === 0) return '';
  const rows = properties
    .map((p) => {
      const safeName = escapeMarkdownTableCell(p.name);
      const safeType = escapeMarkdownTableCell(p.type);
      return `| ${safeName} | \`${safeType}\` |`;
    })
    .join('\n');
  return `\n## ${labels.properties}\n\n| Name | Type |\n| --- | --- |\n${rows}\n`;
}

function renderErrors(labels, throwsEntries) {
  if (!throwsEntries || throwsEntries.length === 0) return '';
  const body = throwsEntries.map((entry) => `- ${entry}`).join('\n');
  return `\n## ${labels.errors}\n\n${body}\n`;
}

function renderSource(relPath, labels) {
  if (!relPath) return '';
  return `\n## ${labels.source}\n\n- \`${relPath}\`\n`;
}

function renderWhenToUse(labels, exportKind, docsText) {
  const text = docsText || labels.whenToUseByKind[exportKind] || labels.whenToUseByKind.unknown;
  return `\n## ${labels.whenToUse}\n\n${text}\n`;
}

function renderExample(labels, exportName, exportKind, packageName) {
  let code = `import { ${exportName} } from '${packageName}';\n\n`;
  if (exportKind === 'function') {
    code += `const result = ${exportName}(/* ...args */);\nconsole.log(result);`;
  } else if (exportKind === 'class') {
    code += `const instance = new ${exportName}(/* ...args */);\nconsole.log(instance);`;
  } else if (exportKind === 'interface' || exportKind === 'type') {
    code = `import type { ${exportName} } from '${packageName}';\n\nlet value!: ${exportName};\nconsole.log(value);`;
  } else {
    code += `console.log(${exportName});`;
  }
  return `\n## ${labels.example}\n\n\`\`\`ts\n${code}\n\`\`\`\n`;
}

function renderPitfalls(labels, exportKind) {
  const lines = labels.pitfallsByKind[exportKind] ?? labels.pitfallsByKind.unknown;
  return `\n## ${labels.pitfalls}\n\n${lines.join('\n')}\n`;
}

function renderRelated(labels, relatedExports) {
  if (!relatedExports || relatedExports.length === 0) {
    return `\n## ${labels.related}\n\n${labels.noRelated}\n`;
  }
  const items = relatedExports.map((item) => `- [${item.name}](../${item.slug}/)`).join('\n');
  return `\n## ${labels.related}\n\n${items}\n`;
}

function pickRelatedExports(exports, currentExport, limit = 4) {
  const others = exports.filter(
    (item) => item.slug !== currentExport.slug && !item.isExperimental
  );
  const sameKind = others.filter((item) => item.kind === currentExport.kind).slice(0, limit);
  if (sameKind.length >= limit) return sameKind;
  const fallback = others
    .filter((item) => !sameKind.some((candidate) => candidate.slug === item.slug))
    .slice(0, limit - sameKind.length);
  return [...sameKind, ...fallback];
}

function renderExportPage({
  localeLabels,
  exportName,
  exportKind,
  packageName,
  docsText,
  throwsEntries,
  relatedExports,
  signature,
  declaredType,
  sourcePath,
  isExperimental,
}) {
  const title = exportName;
  const description = renderExportDescription(localeLabels, exportKind);

  let body = '';
  const frontmatterExtra = isExperimental ? 'sidebar:\n  hidden: true' : '';

  if (isExperimental) {
    body += `\n${localeLabels.experimentalNote}\n`;
  }
  body += renderWhenToUse(localeLabels, exportKind, docsText);

  if (signature) {
    body += `\n## ${localeLabels.signature}\n\n\`\`\`ts\n${signature.signatureText}\n\`\`\`\n`;
    body += renderParamsTable(signature.params, localeLabels);
    body += `\n## ${localeLabels.returns}\n\n\`${signature.returnType}\`\n`;
  } else if (declaredType) {
    body += `\n## ${localeLabels.signature}\n\n\`\`\`ts\n${declaredType.typeText}\n\`\`\`\n`;
    body += renderPropertiesTable(declaredType.properties, localeLabels);
  }

  body += renderExample(localeLabels, exportName, exportKind, packageName);
  body += renderPitfalls(localeLabels, exportKind);
  body += renderRelated(localeLabels, relatedExports);
  body += renderErrors(localeLabels, throwsEntries);
  body += renderSource(sourcePath, localeLabels);

  return (
    `${renderFrontmatter({ title, description, extra: frontmatterExtra })}\n${body}`.trimEnd() +
    '\n'
  );
}

function renderPackageIndex({
  localeLabels,
  packageName,
  publicExports,
  experimentalExports,
}) {
  const title = `${localeLabels.indexTitle}: ${packageName}`;
  const description = localeLabels.packageDescription(packageName);

  const publicItems = publicExports
    .map((e) => `- [${e.name}](./${e.slug}/)`)
    .join('\n');

  let content = `${renderFrontmatter({ title, description })}\n\n${publicItems}\n`;
  if (experimentalExports.length > 0) {
    const experimentalItems = experimentalExports
      .map((e) => `- [${e.name}](./${e.slug}/)`)
      .join('\n');
    content += `\n## ${localeLabels.experimentalTitle}\n\n${experimentalItems}\n`;
  }
  return content;
}

function renderVersionsPage({ localeId, localeLabels, packages }) {
  const title = localeId === 'zh-cn' ? '版本' : 'Versions';
  const description =
    localeId === 'zh-cn'
      ? '当前仓库中各包版本信息。'
      : 'Current package versions in this repository.';
  const rows = packages
    .map((p) => `| ${p.packageName} | ${p.version ?? ''} |`)
    .join('\n');
  return `${renderFrontmatter({
    title,
    description,
  })}\n\n| Package | Version |\n| --- | --- |\n${rows}\n`;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function getExportTargetPath(targetConfig) {
  if (typeof targetConfig === 'string') return targetConfig;
  if (!targetConfig || typeof targetConfig !== 'object') return null;
  if (typeof targetConfig.import === 'string') return targetConfig.import;
  if (typeof targetConfig.default === 'string') return targetConfig.default;
  return null;
}

function mapDistPathToSourcePath(targetPath) {
  if (typeof targetPath !== 'string') return null;
  if (!targetPath.startsWith('./dist/')) return null;
  if (!targetPath.endsWith('.js') && !targetPath.endsWith('.mjs') && !targetPath.endsWith('.cjs')) {
    return null;
  }
  const relative = targetPath.slice('./dist/'.length).replace(/\.(m|c)?js$/, '.ts');
  return `./src/${relative}`;
}

async function discoverEntryFiles(dirPath, packageName, pkgJson) {
  const defaultDocsDirName = path.basename(dirPath);
  const entries = [
    {
      filePath: path.join(dirPath, 'src', 'index.ts'),
      importPath: packageName,
      docsDirName: defaultDocsDirName,
      docsPackageName: packageName,
    },
  ];

  const exportMap = pkgJson.exports;
  if (!exportMap || typeof exportMap !== 'object') return entries;

  for (const [subpath, targetConfig] of Object.entries(exportMap)) {
    if (subpath === '.' || subpath === './package.json') continue;
    if (subpath.includes('*')) continue;
    if (!subpath.startsWith('./')) continue;

    const targetPath = getExportTargetPath(targetConfig);
    const sourceRelativePath = mapDistPathToSourcePath(targetPath);
    if (!sourceRelativePath) continue;

    const sourceFilePath = path.join(dirPath, sourceRelativePath.slice(2));
    if (!(await fileExists(sourceFilePath))) continue;

    const subpathName = subpath.slice(2);
    const docsOverride = DOCS_DIR_OVERRIDES[packageName]?.[subpathName];
    entries.push({
      filePath: sourceFilePath,
      importPath: `${packageName}/${subpathName}`,
      docsDirName: docsOverride?.dirName ?? defaultDocsDirName,
      docsPackageName: docsOverride?.packageName ?? packageName,
    });
  }

  const dedup = new Map(entries.map((entry) => [entry.filePath, entry]));
  return Array.from(dedup.values());
}

async function discoverPackages() {
  const entries = await fs.readdir(packagesRoot, { withFileTypes: true });
  const result = [];
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const dirPath = path.join(packagesRoot, dirent.name);
    const pkgJsonPath = path.join(dirPath, 'package.json');
    const srcIndexPath = path.join(dirPath, 'src', 'index.ts');
    if (!(await fileExists(pkgJsonPath))) continue;
    if (!(await fileExists(srcIndexPath))) continue;
    const pkgJson = await readJson(pkgJsonPath);
    const packageName = pkgJson.name ?? dirent.name;
    const entryFiles = await discoverEntryFiles(dirPath, packageName, pkgJson);
    const experimentalEntryPath = path.join(dirPath, 'src', 'experimental.ts');
    result.push({
      dirName: dirent.name,
      packageName,
      version: pkgJson.version ?? null,
      entryFiles,
      experimentalEntryFile: (await fileExists(experimentalEntryPath))
        ? experimentalEntryPath
        : null,
    });
  }
  return result.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

async function generate() {
  const packages = await discoverPackages();
  const packageDirNames = Array.from(
    new Set(
      packages.flatMap((pkg) => pkg.entryFiles.map((entry) => entry.docsDirName))
    )
  ).sort();

  for (const pkg of packages) {
    const docBuckets = new Map();

    function getBucket(docsDirName, docsPackageName) {
      const existing = docBuckets.get(docsDirName);
      if (existing) return existing;
      const created = {
        docsDirName,
        docsPackageName,
        publicExportMap: new Map(),
        experimentalExports: [],
      };
      docBuckets.set(docsDirName, created);
      return created;
    }

    for (const entry of pkg.entryFiles) {
      const bucket = getBucket(entry.docsDirName, entry.docsPackageName);
      const { program, checker } = createProgram(entry.filePath);
      const sourceFile = program.getSourceFile(entry.filePath);
      if (!sourceFile) continue;

      const exportsForEntry = getModuleExports(checker, sourceFile)
        .map((symbol) => {
          const name = symbol.getName();
          const targetSymbol = resolveExportSymbol(checker, symbol);
          const kind = getExportKind(targetSymbol);
          const docsText = getSymbolDocs(checker, targetSymbol);
          const throwsEntries = getThrowsEntries(targetSymbol);
          const signature = getSignature(checker, targetSymbol);
          const declaredType = signature
            ? null
            : getDeclaredType(checker, targetSymbol);
          const sourcePath = getSymbolDeclPath(targetSymbol);
          const slug = kebabCase(name);
          return {
            name,
            kind,
            docsText,
            throwsEntries,
            signature,
            declaredType,
            sourcePath,
            slug,
            isExperimental: false,
            importPath: entry.importPath,
          };
        })
        .filter((e) => e.slug.length > 0);

      for (const exp of exportsForEntry) {
        if (bucket.publicExportMap.has(exp.slug)) continue;
        bucket.publicExportMap.set(exp.slug, exp);
      }
    }

    if (pkg.experimentalEntryFile) {
      const rootBucket = getBucket(pkg.dirName, pkg.packageName);
      const expProgram = createProgram(pkg.experimentalEntryFile);
      const expSourceFile = expProgram.program.getSourceFile(
        pkg.experimentalEntryFile
      );
      if (expSourceFile) {
        rootBucket.experimentalExports = getModuleExports(
          expProgram.checker,
          expSourceFile
        )
          .map((symbol) => {
            const name = symbol.getName();
            const targetSymbol = resolveExportSymbol(expProgram.checker, symbol);
            const kind = getExportKind(targetSymbol);
            const docsText = getSymbolDocs(expProgram.checker, targetSymbol);
            const throwsEntries = getThrowsEntries(targetSymbol);
            const signature = getSignature(expProgram.checker, targetSymbol);
            const declaredType = signature
              ? null
              : getDeclaredType(expProgram.checker, targetSymbol);
            const sourcePath = getSymbolDeclPath(targetSymbol);
            const slug = kebabCase(name);
            return {
              name,
              kind,
              docsText,
              throwsEntries,
              signature,
              declaredType,
              sourcePath,
              slug,
              isExperimental: true,
              importPath: `${pkg.packageName}/experimental`,
            };
          })
          .filter((e) => e.slug.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    for (const bucket of docBuckets.values()) {
      const publicExports = Array.from(bucket.publicExportMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const exports = [...publicExports, ...bucket.experimentalExports];
      const exportSlugs = exports.map((exp) => exp.slug);

      for (const locale of LOCALES) {
        const localeRoot = locale.contentDir
          ? path.join(docsRoot, locale.contentDir)
          : docsRoot;
        const pkgDir = path.join(localeRoot, 'api-reference', bucket.docsDirName);
        await ensureDir(pkgDir);
        await cleanupStaleExportDirs(pkgDir, exportSlugs);
        await fs.writeFile(
          path.join(pkgDir, 'index.mdx'),
          renderPackageIndex({
            localeLabels: locale.labels,
            packageName: bucket.docsPackageName,
            publicExports,
            experimentalExports: bucket.experimentalExports,
          }),
          'utf8'
        );

        for (const exp of exports) {
          const expDir = path.join(pkgDir, exp.slug);
          await ensureDir(expDir);
          const relatedExports = pickRelatedExports(publicExports, exp);
          const mdx = renderExportPage({
            localeLabels: locale.labels,
            exportName: exp.name,
            exportKind: exp.kind,
            packageName: exp.importPath ?? bucket.docsPackageName,
            docsText: exp.docsText,
            throwsEntries: exp.throwsEntries,
            relatedExports,
            signature: exp.signature,
            declaredType: exp.declaredType,
            sourcePath: exp.sourcePath,
            isExperimental: exp.isExperimental,
          });
          await fs.writeFile(path.join(expDir, 'index.mdx'), mdx, 'utf8');
        }
      }
    }
  }

  for (const locale of LOCALES) {
    const localeRoot = locale.contentDir
      ? path.join(docsRoot, locale.contentDir)
      : docsRoot;
    const apiReferenceDir = path.join(localeRoot, 'api-reference');
    await ensureDir(apiReferenceDir);
    await cleanupStalePackageDirs(apiReferenceDir, packageDirNames);
    await fs.writeFile(
      path.join(apiReferenceDir, 'versions.mdx'),
      renderVersionsPage({
        localeId: locale.id,
        localeLabels: locale.labels,
        packages,
      }),
      'utf8'
    );
  }
}

await generate();
