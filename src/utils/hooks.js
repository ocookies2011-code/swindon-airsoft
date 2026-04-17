import { useEffect, useState } from "react";
// utils/hooks.js — useMobile, useToast

function useMobile(bp = 640) {
  const [mobile, setMobile] = useState(() => window.innerWidth <= bp);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= bp);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return mobile;
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, type = "green") => {
    setToast({ msg, type });
    const duration = type === "red" ? 5000 : msg.length > 60 ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
  };
  return [toast, show];
}

export { useMobile, useToast };
