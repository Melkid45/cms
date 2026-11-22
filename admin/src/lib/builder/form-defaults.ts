import type { CmsForm } from "./types";
export function defaultForm(id: string, photo = false): CmsForm {
  return {
    id,
    title: "Let’s discuss your project.",
    description:
      "Tell us what you have in mind. We’ll get back to you shortly.",
    buttonLabel: "Send enquiry",
    columns: 2,
    layout: photo ? "split" : "compact",
    image: photo ? "/images/section-explorations/room.jpg" : "",
    fields: [
      {
        id: `${id}-name`,
        type: "text",
        name: "name",
        label: "Your name",
        placeholder: "Your name",
        required: true,
        width: "half",
        options: [],
      },
      {
        id: `${id}-email`,
        type: "email",
        name: "email",
        label: "Email",
        placeholder: "you@example.com",
        required: true,
        width: "half",
        options: [],
      },
      {
        id: `${id}-message`,
        type: "textarea",
        name: "message",
        label: "Your message",
        placeholder: "A little about your project",
        required: false,
        width: "full",
        options: [],
      },
    ],
  };
}

export function variantForm(id: string, variant: string): CmsForm {
  const form=defaultForm(id,variant === "form-v2");
  if(variant === "form-v6") return {...form,title:"A conversation is a good place to start.",description:"Leave your details and we’ll call you back to discuss what comes next.",buttonLabel:"Request a call",fields:form.fields.filter(f=>f.name !== "message").map(f=>f.name === "email" ? {...f,type:"tel",name:"phone",label:"Phone number",placeholder:"Your phone number"} : f)};
  return form;
}
