export const STORE_COVERAGE_THRESHOLDS = {
  lines: 80,
  functions: 80,
  branches: 65,
  statements: 80,
  'src/lib/core/*.ts': {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
  'src/lib/core/node-factory/**/*.ts': {
    lines: 75,
    functions: 60,
    branches: 60,
    statements: 75,
  },
} as const;
