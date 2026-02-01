import fs from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript';

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, 'apps', 'docs', 'src', 'content', 'docs');
const packagesRoot = path.join(repoRoot, 'packages');

const LOCALES = [
  {
    id: 'en',
    labels: {
      title: 'Reference',
      signature: 'Signature',
      parameters: 'Parameters',
      properties: 'Properties',
      returns: 'Returns',
      errors: 'Errors',
      auth: 'Authentication',
      source: 'Source',
      indexTitle: 'API Reference',
      none: '(none)',
      errorsBody: [
        '- This library does not define standardized error codes.',
        '- Mutations can report failures through `onError(listener)` (operation, path, value).',
      ].join('\n'),
      authBody: [
        '- Not applicable. OIN is a local TypeScript/JavaScript library and does not implement authentication.',
      ].join('\n'),
    },
  },
  {
    id: 'zh-cn',
    labels: {
      title: '参考',
      signature: '签名',
      parameters: '参数',
      properties: '属性',
      returns: '返回',
      errors: '错误',
      auth: '鉴权',
      source: '源码',
      indexTitle: 'API 参考',
      none: '（无）',
      errorsBody: [
        '- 本库未定义标准化错误码。',
        '- 变更失败可通过 `onError(listener)` 上报（operation、path、value）。',
      ].join('\n'),
      authBody: [
        '- 不适用。OIN 是本地 TypeScript/JavaScript 库，不包含鉴权机制。',
      ].join('\n'),
    },
  },
];

const TYPE_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

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

function normalizeTypeText(text) {
  return text.replace(/import\(".*?"\)\./g, '');
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
  const properties = type.getProperties().map((p) => {
    const pDecl = p.valueDeclaration ?? p.declarations?.[0] ?? decl;
    const pTypeRaw = checker.typeToString(
      checker.getTypeOfSymbolAtLocation(p, pDecl),
      pDecl,
      TYPE_FLAGS
    );
    return { name: p.getName(), type: normalizeTypeText(pTypeRaw) };
  });
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

function renderFrontmatter({ title, description }) {
  const safeTitle = title ?? '';
  const safeDescription = description ?? '';
  return `---\ntitle: ${JSON.stringify(
    safeTitle
  )}\ndescription: ${JSON.stringify(safeDescription)}\n---\n`;
}

function renderParamsTable(params, labels) {
  if (!params || params.length === 0)
    return `\n## ${labels.parameters}\n\n${labels.none}\n`;
  const rows = params
    .map((p) => {
      const safeName = String(p.name).replace(/\|/g, '\\|');
      const safeType = String(p.type).replace(/\|/g, '\\|');
      return `| ${safeName} | \`${safeType}\` |`;
    })
    .join('\n');
  return `\n## ${labels.parameters}\n\n| Name | Type |\n| --- | --- |\n${rows}\n`;
}

function renderPropertiesTable(properties, labels) {
  if (!properties || properties.length === 0) return '';
  const rows = properties
    .map((p) => {
      const safeName = String(p.name).replace(/\|/g, '\\|');
      const safeType = String(p.type).replace(/\|/g, '\\|');
      return `| ${safeName} | \`${safeType}\` |`;
    })
    .join('\n');
  return `\n## ${labels.properties}\n\n| Name | Type |\n| --- | --- |\n${rows}\n`;
}

function renderErrors(labels) {
  return `\n## ${labels.errors}\n\n${labels.errorsBody}\n`;
}

function renderAuth(labels) {
  return `\n## ${labels.auth}\n\n${labels.authBody}\n`;
}

function renderSource(relPath, labels) {
  if (!relPath) return '';
  return `\n## ${labels.source}\n\n- \`${relPath}\`\n`;
}

function renderExportPage({
  localeLabels,
  exportName,
  exportKind,
  signature,
  declaredType,
  sourcePath,
}) {
  const title = exportName;
  const description = `${exportKind} export`;

  let body = '';

  if (signature) {
    body += `\n## ${localeLabels.signature}\n\n\`\`\`ts\n${signature.signatureText}\n\`\`\`\n`;
    body += renderParamsTable(signature.params, localeLabels);
    body += `\n## ${localeLabels.returns}\n\n\`${signature.returnType}\`\n`;
  } else if (declaredType) {
    body += `\n## ${localeLabels.signature}\n\n\`\`\`ts\n${declaredType.typeText}\n\`\`\`\n`;
    body += renderPropertiesTable(declaredType.properties, localeLabels);
  }

  body += renderErrors(localeLabels);
  body += renderAuth(localeLabels);
  body += renderSource(sourcePath, localeLabels);

  return (
    `${renderFrontmatter({ title, description })}\n${body}`.trimEnd() + '\n'
  );
}

function renderPackageIndex({ localeLabels, packageName, exports }) {
  const title = `${localeLabels.indexTitle}: ${packageName}`;
  const description = `Exports of ${packageName}`;

  const items = exports.map((e) => `- [${e.name}](./${e.slug}/)`).join('\n');

  return `${renderFrontmatter({ title, description })}\n\n${items}\n`;
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
    result.push({
      dirName: dirent.name,
      packageName: pkgJson.name ?? dirent.name,
      version: pkgJson.version ?? null,
      entryFile: srcIndexPath,
    });
  }
  return result.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

async function generate() {
  const packages = await discoverPackages();

  for (const pkg of packages) {
    const { program, checker } = createProgram(pkg.entryFile);
    const sourceFile = program.getSourceFile(pkg.entryFile);
    if (!sourceFile) continue;

    const exports = getModuleExports(checker, sourceFile)
      .map((symbol) => {
        const name = symbol.getName();
        const targetSymbol = resolveExportSymbol(checker, symbol);
        const kind = getExportKind(targetSymbol);
        const signature = getSignature(checker, targetSymbol);
        const declaredType = signature
          ? null
          : getDeclaredType(checker, targetSymbol);
        const sourcePath = getSymbolDeclPath(targetSymbol);
        const slug = kebabCase(name);
        return { name, kind, signature, declaredType, sourcePath, slug };
      })
      .filter((e) => e.slug.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const locale of LOCALES) {
      const pkgDir = path.join(docsRoot, locale.id, 'reference', pkg.dirName);
      await ensureDir(pkgDir);
      await fs.writeFile(
        path.join(pkgDir, 'index.mdx'),
        renderPackageIndex({
          localeLabels: locale.labels,
          packageName: pkg.packageName,
          exports,
        }),
        'utf8'
      );

      for (const exp of exports) {
        const expDir = path.join(pkgDir, exp.slug);
        await ensureDir(expDir);
        const mdx = renderExportPage({
          localeLabels: locale.labels,
          exportName: exp.name,
          exportKind: exp.kind,
          signature: exp.signature,
          declaredType: exp.declaredType,
          sourcePath: exp.sourcePath,
        });
        await fs.writeFile(path.join(expDir, 'index.mdx'), mdx, 'utf8');
      }
    }
  }

  for (const locale of LOCALES) {
    const referenceDir = path.join(docsRoot, locale.id, 'reference');
    await ensureDir(referenceDir);
    await fs.writeFile(
      path.join(referenceDir, 'versions.mdx'),
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
