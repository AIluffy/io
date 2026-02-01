I will build a complete Starlight documentation site in `apps/docs` within your Nx workspace.

### 1. Workspace & Project Setup
*   **Update `package.json`**: Add `apps/*` to `workspaces` to support the new application location.
*   **Create Application**: Initialize a new Starlight project in `apps/docs`.
*   **Install Dependencies**: Install `astro`, `@astrojs/starlight`, `@astrojs/react`, `react`, `react-dom` (and TypeScript types).

### 2. Configuration (`astro.config.mjs`)
*   **Starlight Integration**: Configure the integration with:
    *   **Title**: "OIN Documentation" (or similar).
    *   **Locales**: Support `en` (English) and `zh-cn` (Simplified Chinese) to enable multi-language and Chinese search segmentation.
    *   **Sidebar**: Configure a grouped sidebar structure (Guides, Reference).
    *   **Components**: Map custom component overrides.
    *   **Search**: Ensure built-in Pagefind is active (default).

### 3. Content Structure (`src/content/docs/`)
*   **Versioning & i18n**: Create language subdirectories (`src/content/docs/en/`, `src/content/docs/zh-cn/`).
*   **Landing Page**: Create `index.mdx` for both languages with hero sections.
*   **Example Docs**: Add sample guides using Starlight components (`<Tabs>`, `<Steps>`, `<FileTree>`, `<Aside>`) and frontmatter.
*   **Type Safety**: Configure `src/content.config.ts` (or legacy `config.ts`) for frontmatter validation.

### 4. Customization & Theme
*   **CSS Variables**: Create `src/styles/custom.css` to override Starlight's default colors and fonts (matching "OIN" brand if applicable).
*   **Component Overrides**:
    *   `Head`: Add custom meta tags/scripts.
    *   `Footer`: Custom footer with copyright/links.
    *   `SiteTitle/Logo`: Custom logo component.

### 5. Build & Deployment
*   **Output**: Configure `output: 'static'` in `astro.config.mjs`.
*   **Scripts**: Add `build`, `dev`, `preview` scripts to `apps/docs/package.json`.
*   **CI/CD**: Create a GitHub Actions workflow (`.github/workflows/deploy-docs.yml`) to build and deploy the static site (targeting GitHub Pages).
*   **Documentation**: Create `apps/docs/README.md` with development and deployment instructions.

I will start by setting up the workspace changes and scaffolding the application files.