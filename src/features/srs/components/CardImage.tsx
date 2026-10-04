import Image from "next/image";
import type {Card} from "@/lib/types";
import {cn} from "@/lib/cn";
export function CardImage({card,className}:{card:Card;className?:string}) {
 if(!card.imageUrl)return null;
 // Protected images need the browser's session cookie; skip the server image optimizer.
 return <Image src={card.imageUrl} alt={card.imageAlt||card.definition} width={800} height={600} unoptimized className={cn("h-auto max-h-40 w-auto max-w-full rounded-lg object-contain",className)}/>;
}
