import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { APP_CONFIG } from './config';
import { serializeJsonLd } from './structured-data';
import { absoluteUrl } from './urls';

export interface PageSeo {
  title: string;
  description: string;
  /** Chemin canonique de la page (« /stades/anfield-liverpool »). */
  path: string;
  jsonLd?: Record<string, unknown> | null;
  /** Vrai pour les pages à ne pas indexer (résultats de recherche, erreurs). */
  noindex?: boolean;
}

const JSON_LD_ID = 'donnees-structurees';
const OG_IMAGE = { path: '/og.png', width: 1200, height: 630 };

/** Titre, description, URL canonique et données structurées de la page courante. */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(APP_CONFIG);

  set(page: PageSeo): void {
    const url = absoluteUrl(this.config.siteUrl || this.document.location.origin, page.path);

    this.title.setTitle(page.title);
    this.meta.updateTag({ name: 'description', content: page.description });
    this.meta.updateTag({
      name: 'robots',
      content: page.noindex ? 'noindex, follow' : 'index, follow',
    });
    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'Spot the Game' });
    this.meta.updateTag({ property: 'og:locale', content: 'fr_FR' });
    // Image d'aperçu des liens partagés (messageries, réseaux sociaux).
    const image = absoluteUrl(this.config.siteUrl || this.document.location.origin, OG_IMAGE.path);
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: String(OG_IMAGE.width) });
    this.meta.updateTag({ property: 'og:image:height', content: String(OG_IMAGE.height) });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
    this.setJsonLd(page.jsonLd ?? null);
  }

  private setCanonical(url: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setJsonLd(data: Record<string, unknown> | null): void {
    const head = this.document.head;
    head.querySelector(`#${JSON_LD_ID}`)?.remove();
    if (!data) return;
    const script = this.document.createElement('script');
    script.id = JSON_LD_ID;
    script.type = 'application/ld+json';
    script.textContent = serializeJsonLd(data);
    head.appendChild(script);
  }
}
