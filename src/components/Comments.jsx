import { useState, useEffect } from 'react';
import Giscus from '@giscus/react';
import { giscus } from '../consts';

export default function Comments() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const getTheme = () =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light';

    setTheme(getTheme());

    const observer = new MutationObserver(() => setTheme(getTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <Giscus
      id="comments"
      repo={giscus.repo}
      repoId={giscus.repoId}
      category={giscus.category}
      categoryId={giscus.categoryId}
      mapping="pathname"
      strict="0"
      reactionsEnabled="1"
      emitMetadata="0"
      inputPosition="top"
      theme={theme}
      lang="en"
      loading="lazy"
    />
  );
}
