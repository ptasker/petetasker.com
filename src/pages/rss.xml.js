import rss from '@astrojs/rss';
import { siteUrl, title, description } from '../consts';

export async function GET(context) {
  // Get all blog posts
  const postModules = import.meta.glob('../../content/blog/**/*.md', { eager: true });
  
  const posts = Object.entries(postModules)
    .map(([path, module]) => ({
      ...module,
      file: path
    }))
    .filter((post) => post.frontmatter.type === 'post')
    .sort((a, b) => new Date(b.frontmatter.date).valueOf() - new Date(a.frontmatter.date).valueOf());

  return rss({
    title: title,
    description: description,
    site: context.site || siteUrl,
    items: posts.map((post) => {
      // Generate the link
      const slug = post.frontmatter.permalink || `/${post.file.split('/').pop().split('.').shift()}`;
      
      return {
        title: post.frontmatter.title,
        pubDate: new Date(post.frontmatter.date),
        description: post.frontmatter.description || '',
        link: slug,
      };
    }),
    customData: `<language>en-us</language>`,
  });
}
