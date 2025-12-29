import { useEffect } from "react";
import { DEFAULT_SEO, generateSEO, type SEOMetadata } from "@/lib/seo";

interface SEOHeadProps {
  pageKey?: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  keywords?: string[];
  canonical?: string;
}

function setMetaTag(name: string, content: string, isProperty = false) {
  const attribute = isProperty ? "property" : "name";
  let element = document.querySelector(`meta[${attribute}="${name}"]`);
  
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  
  element.setAttribute("content", content);
}

function setLinkTag(rel: string, href: string) {
  let element = document.querySelector(`link[rel="${rel}"]`);
  
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }
  
  element.setAttribute("href", href);
}

export function SEOHead({
  pageKey,
  title,
  description,
  ogTitle,
  ogDescription,
  ogImage,
  twitterCard,
  keywords,
  canonical,
}: SEOHeadProps) {
  const seo = generateSEO(pageKey, {
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage,
    twitterCard,
    keywords,
    canonical,
  });

  useEffect(() => {
    document.title = seo.title;

    setMetaTag("description", seo.description);
    
    if (seo.keywords && seo.keywords.length > 0) {
      setMetaTag("keywords", seo.keywords.join(", "));
    }

    setMetaTag("og:title", seo.ogTitle || seo.title, true);
    setMetaTag("og:description", seo.ogDescription || seo.description, true);
    setMetaTag("og:type", "website", true);
    setMetaTag("og:site_name", "QuantEdge Research", true);
    
    if (seo.ogImage) {
      setMetaTag("og:image", seo.ogImage, true);
    }

    setMetaTag("twitter:card", seo.twitterCard || "summary_large_image");
    setMetaTag("twitter:title", seo.ogTitle || seo.title);
    setMetaTag("twitter:description", seo.ogDescription || seo.description);
    
    if (seo.ogImage) {
      setMetaTag("twitter:image", seo.ogImage);
    }

    if (seo.canonical) {
      setLinkTag("canonical", seo.canonical);
    }
  }, [seo]);

  return null;
}
