// src/app/features/explorer/explorer.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchesStoreService } from '../../core/matches-store.service';
import { SearchInfo } from '../../core/models';
import { FiltersPanelComponent } from './components/filters-panel/filters-panel';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [CommonModule, FiltersPanelComponent],
  templateUrl: './explorer.html',
  styleUrls: ['./explorer.scss'],
})
export class ExplorerComponent {
  readonly store = inject(MatchesStoreService);

  info(): SearchInfo {
    return this.store.info();
  }

  fmtDateTime(iso?: string, date?: string, time?: string) {
    const base = iso ?? (date ? `${date}T${time ?? '00:00:00'}Z` : undefined);
    if (!base) return '';
    const d = new Date(base);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
