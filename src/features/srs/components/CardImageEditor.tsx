"use client";
import {useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useTranslations} from "next-intl";
import {z} from "zod";
import {Button} from "@/components/ui/Button";
import {Dialog} from "@/components/ui/Dialog";
import {Field,Input} from "@/components/ui/fields";
import {useToast} from "@/components/ui/Toast";
import {createHttpClient} from "@/lib/http-client";
import {useErrorMessage} from "@/lib/use-messages";
import {RepositoryError} from "@/lib/repository-error";
const client=createHttpClient();
export function CardImageEditor({setId,cardId}:{setId:string;cardId:string}) {
 const t=useTranslations("learning"),[open,setOpen]=useState(false),[alt,setAlt]=useState(""),[busy,setBusy]=useState(false),file=useRef<HTMLInputElement>(null),cache=useQueryClient(),{toast}=useToast(),errorMessage=useErrorMessage();
 const upload=async()=>{const image=file.current?.files?.[0];if(!image)return;setBusy(true);try {
  if(!["image/png","image/jpeg","image/webp"].includes(image.type)||image.size>5*1024*1024)throw new RepositoryError("VALIDATION");
  const {data}=await client.request("/api/v1/ai/uploads",z.object({uploadId:z.uuid(),url:z.string(),mime:z.string()}),{method:"POST",body:{name:image.name,size:image.size,mime:image.type}});
  const target=new URL(data.url,window.location.origin);if(target.origin!==window.location.origin&&target.protocol!=="https:")throw new RepositoryError("VALIDATION");
  const sent=await fetch(data.url,{method:"PUT",credentials:target.origin===window.location.origin ? "same-origin" : "omit",headers:{"Content-Type":image.type},body:image,redirect:"error"});if(!sent.ok)throw new RepositoryError("VALIDATION");
  await client.request(`/api/v1/cards/${cardId}/image`,z.object({imageUrl:z.string(),imageAlt:z.string()}),{method:"POST",body:{uploadId:data.uploadId,alt}});
  await cache.invalidateQueries({queryKey:["sets",setId]});setOpen(false);toast(t("imageSaved"));
 }catch(error){toast(errorMessage(error),"error");}finally{setBusy(false);}};
 if(process.env.NEXT_PUBLIC_DATA_SOURCE!=="http")return null;
 return <><Button variant="ghost" size="sm" onClick={()=>setOpen(true)}>{t("image")}</Button><Dialog open={open} onOpenChange={setOpen} title={t("uploadImage")} description={t("imageHint")} footer={<Button loading={busy} onClick={()=>void upload()}>{t("uploadImage")}</Button>}><div className="space-y-4"><Field label={t("image")}>{control=><Input {...control} ref={file} type="file" accept="image/png,image/jpeg,image/webp"/>}</Field><Field label={t("imageAlt")}>{control=><Input {...control} value={alt} maxLength={1000} onChange={e=>setAlt(e.target.value)}/>}</Field></div></Dialog></>;
}
