"use client";

import { FormEvent, useRef, useState } from "react";
import { Camera, Check, Eye, EyeOff, Save } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ProfileForm() {
  const picker = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card className="shadow-none">
        <CardHeader className="border-b"><CardTitle className="text-sm">Profile picture</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <Avatar className="size-20" size="lg">
            {avatar && <AvatarImage src={avatar} alt="New avatar" />}
            <AvatarFallback className="bg-black text-lg font-semibold text-white">IM</AvatarFallback>
          </Avatar>
          <div className="flex-1"><p className="text-sm font-medium">Administrator avatar</p><p className="mt-1 text-xs leading-5 text-neutral-400">JPG, PNG, or WebP. Recommended size: 400×400 px.</p></div>
          <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setAvatar(URL.createObjectURL(file)); }} />
          <Button type="button" variant="outline" onClick={() => picker.current?.click()}><Camera data-icon="inline-start" /> Upload</Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b"><CardTitle className="text-sm">Basic information</CardTitle></CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="firstName">First name</Label><Input id="firstName" defaultValue="Ilya" /></div>
          <div className="grid gap-2"><Label htmlFor="lastName">Last name</Label><Input id="lastName" defaultValue="Melman" /></div>
          <div className="grid gap-2 sm:col-span-2"><Label htmlFor="profileEmail">Email address</Label><Input id="profileEmail" type="email" defaultValue="ilya@harbstone.com" /><p className="text-[11px] text-neutral-400">Notifications and account recovery links are sent to this address.</p></div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b"><CardTitle className="text-sm">Change password</CardTitle></CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2"><Label htmlFor="currentPassword">Current password</Label><Input id="currentPassword" type={showPasswords ? "text" : "password"} placeholder="Enter your current password" /></div>
          <div className="grid gap-2"><Label htmlFor="newPassword">New password</Label><Input id="newPassword" type={showPasswords ? "text" : "password"} placeholder="At least 8 characters" minLength={8} /></div>
          <div className="grid gap-2"><Label htmlFor="confirmPassword">Confirm password</Label><Input id="confirmPassword" type={showPasswords ? "text" : "password"} placeholder="Repeat the new password" minLength={8} /></div>
          <button type="button" onClick={() => setShowPasswords((value) => !value)} className="flex w-fit items-center gap-2 text-xs text-neutral-500 hover:text-black">
            {showPasswords ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{showPasswords ? "Hide passwords" : "Show passwords"}
          </button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b"><CardTitle className="text-sm">Notifications</CardTitle></CardHeader>
        <CardContent className="divide-y p-0">
          {[{ title: "Content changes", text: "Notify me when content is published or unpublished" }, { title: "Team activity", text: "Notify me about new members and role changes" }].map((item, index) => (
            <div key={item.title} className="flex items-center justify-between gap-5 p-5"><span><span className="block text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-neutral-400">{item.text}</span></span><Switch defaultChecked={index === 0} /></div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="flex items-center gap-1.5 text-xs font-medium"><Check className="size-3.5" /> Changes saved</span>}
        <Button type="submit"><Save data-icon="inline-start" /> Save changes</Button>
      </div>
    </form>
  );
}
