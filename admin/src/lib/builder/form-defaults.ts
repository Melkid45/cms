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
