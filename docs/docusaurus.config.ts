import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

/**
 * Local Docusaurus config — overrides the base image's default when this
 * directory is copied over /template (see ./Dockerfile). Content lives in
 * ./docs (games/); the sidebar is ./sidebar.ts.
 *
 * Repository-owned Docusaurus configuration. Broken links fail production
 * builds so published navigation cannot drift silently.
 */
const config: Config = {
  title: 'SubZeroDev GitHub Plugin',
  tagline: 'CLI-first GitHub integration that produces provider-independent, versioned project data.',
  url: 'https://plugins-github.subzerodev.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw'
    }
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebar.ts',
          routeBasePath: 'docs'
        },
        blog: false
      } satisfies Preset.Options
    ]
  ],

  themeConfig: {
    navbar: {
      title: 'SubZeroDev GitHub Plugin',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs'
        }
      ]
    },
    footer: { style: 'dark', links: [] }
  } satisfies Preset.ThemeConfig
};

export default config;
