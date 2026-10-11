import Image from 'next/image';
import type { Block, PublicContent } from '@/lib/editorial/types';
export function ContentBlocks({
  blocks,
  media = [],
}: {
  blocks: readonly Block[];
  media?: PublicContent['media'];
}) {
  return (
    <div className="editorial-prose">
      {blocks.map((b, i) => {
        if (b.type === 'heading')
          return b.level === 2 ? <h2 key={i}>{b.text}</h2> : <h3 key={i}>{b.text}</h3>;
        if (b.type === 'paragraph') return <p key={i}>{b.text}</p>;
        if (b.type === 'quote')
          return (
            <blockquote key={i}>
              <p>{b.text}</p>
            </blockquote>
          );
        if (b.type === 'image') {
          const image = media.find((m) => m.id === b.mediaAssetId);
          return image === undefined ? null : (
            <figure key={i}>
              <Image
                src={image.url}
                width={image.width}
                height={image.height}
                alt={b.alt}
                sizes="(max-width: 768px) 90vw, 760px"
              />
            </figure>
          );
        }
        return null;
      })}
    </div>
  );
}
