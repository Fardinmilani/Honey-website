import { createTranslator, isLocale, localizedHref } from '@honey/i18n';
import { Container, Stack } from '@honey/ui';
import { notFound } from 'next/navigation';

import { Hero } from '../../../components/hero/hero';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) {
    notFound();
  }
  const t = createTranslator(raw);
  const homeHref = localizedHref('/', raw);

  return (
    <Stack gap="xl">
      <Hero
        locale={raw}
        headline={t('home.headline')}
        supporting={t('home.supporting')}
        ctaLabel={t('home.ctaExplore')}
        ctaHref={`${homeHref}#main-content`}
        ariaLabel={t('home.heroAriaLabel')}
      />
      <Container>
        <p className="home-lead">{t('home.supporting')}</p>
      </Container>
    </Stack>
  );
}
