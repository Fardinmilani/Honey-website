import { EditorialContentPage, contentMetadata } from '@/components/editorial/content-page';
type Props = { params: Promise<{ locale: string; slug: string }> };
export function generateMetadata(props: Props) {
  return contentMetadata('page', props);
}
export default function Page(props: Props) {
  return <EditorialContentPage kind="page" {...props} />;
}
