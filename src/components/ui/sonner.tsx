import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      duration={2400}
      gap={8}
      visibleToasts={2}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:w-[min(92vw,360px)] group-[.toaster]:rounded-xl group-[.toaster]:bg-background/95 group-[.toaster]:text-xs group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-xl",
          title: "group-[.toast]:text-xs group-[.toast]:font-bold",
          description: "group-[.toast]:text-[11px] group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
