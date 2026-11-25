import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DataApi } from './data-api.service';
import { GoingService } from './going.service';

describe('GoingService', () => {
  let service: GoingService;
  let api: jasmine.SpyObj<Pick<DataApi, 'setGoing' | 'myGoing'>>;

  beforeEach(() => {
    localStorage.removeItem('stg-appareil');
    api = jasmine.createSpyObj('DataApi', ['setGoing', 'myGoing']);
    TestBed.configureTestingModule({ providers: [{ provide: DataApi, useValue: api }] });
    service = TestBed.inject(GoingService);
  });

  afterEach(() => localStorage.removeItem('stg-appareil'));

  it('ne crée aucun identifiant tant que le visiteur n’a rien demandé', async () => {
    await service.load(['a', 'b']);
    expect(localStorage.getItem('stg-appareil')).toBeNull();
    expect(api.myGoing).not.toHaveBeenCalled();
  });

  it('crée l’identifiant au premier « J’y vais », puis le réutilise', async () => {
    api.setGoing.and.returnValue(of({ going: true, goingCount: 3 }));
    const state = await service.toggle('lens-lille');
    const deviceId = localStorage.getItem('stg-appareil');

    expect(state).toEqual({ going: true, goingCount: 3 });
    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.setGoing).toHaveBeenCalledWith('lens-lille', deviceId as string, true);
    expect(service.mine().has('lens-lille')).toBeTrue();

    api.setGoing.and.returnValue(of({ going: false, goingCount: 2 }));
    await service.toggle('lens-lille');
    expect(api.setGoing).toHaveBeenCalledWith('lens-lille', deviceId as string, false);
    expect(service.mine().has('lens-lille')).toBeFalse();
  });

  it('retrouve les matchs déjà marqués par cet appareil', async () => {
    localStorage.setItem('stg-appareil', 'appareil-connu');
    api.myGoing.and.returnValue(of(['b']));
    await service.load(['a', 'b']);
    expect(api.myGoing).toHaveBeenCalledWith('appareil-connu', ['a', 'b']);
    expect([...service.mine()]).toEqual(['b']);
  });

  it('laisse l’état inchangé quand le serveur refuse', async () => {
    api.setGoing.and.returnValue(throwError(() => new Error('refusé')));
    await expectAsync(service.toggle('lens-lille')).toBeRejected();
    expect(service.mine().size).toBe(0);
  });

  it('ignore une panne au chargement', async () => {
    localStorage.setItem('stg-appareil', 'appareil-connu');
    api.myGoing.and.returnValue(throwError(() => new Error('réseau')));
    await expectAsync(service.load(['a'])).toBeResolved();
  });
});
