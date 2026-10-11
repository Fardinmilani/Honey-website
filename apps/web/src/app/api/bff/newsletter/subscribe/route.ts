import { publicAction } from '@/lib/api-client/public-action';
export const POST = publicAction('/v1/newsletter/subscribe', ['email', 'locale', 'consent']);
