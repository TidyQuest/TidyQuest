import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suggestTaskIcon, TASK_ICON_KEYS } from '../utils/taskIcons';

describe('Icon suggestions for family activities', () => {
  it("picks a fitting icon for the family's chores, before the room-by-room rules", () => {
    const cases: Array<[string, string]> = [
      ['Morning Feeding: 3 dogs + 2 cats', 'petfood'], ['Scoop the Litter Boxes', 'litter'], ['Dog Poop Patrol (yard)', 'poop'],
      ['Wash Pet Bowls', 'petfood'], ['Wash Dog & Cat Beds', 'petbed'], ['Flea/Tick & Heartworm Meds', 'petmeds'],
      ['🐕 Walk the Dogs (20+ min)', 'leash'], ['🐾 Brush or Bathe a Dog', 'dog'], ['Skim Pool & Empty Skimmer Baskets', 'skimmer'],
      ['🏊 Scrub the Pool Tile Line', 'pool'], ['Water Potted Plants', 'wateringcan'], ['Mow the Lawn', 'mower'], ['Garden hose away', 'hose'],
      ['Test Smoke & CO Alarms', 'smokealarm'], ['Replace Smoke Alarm Batteries', 'smokealarm'], ['Replace HVAC Filter', 'airfilter'],
      ['Whole house water filter', 'waterfilter'], ['Check Fire Extinguishers', 'extinguisher'], ['🚗 Wash the Cars', 'carwash'],
      ['30 mins bill paying sesh 🙌', 'bills'], ['Grocery Run', 'groceries'], ['Get to Work on Time ⏰', 'alarmclock'], ['Made the Bus 🚌', 'bus'],
      ['🏆 Report Card: Each A', 'reportcard'], ['🔥 Win Streak Bonus (2+ weeks in a row)', 'streak'], ['🏆 Weekly Win (parent awards)', 'trophy'],
      ['⭐ Caught Being Awesome', 'star'], ['Homework: done & in the folder', 'homework'], ['Bedtime Routine: shower · teeth · backpack', 'bedtime'],
      ['Morning Launch: teeth · hair · covers up', 'toothbrush'], ['Fold & Put Away Towels', 'folding'], ['📚 All Homework Turned In This Week', 'homework'], ['Set & Clear the Table', 'table'],
      // The old rules still apply to everything else
      ['Clean Shower & Tub', 'shower'], ['Make the Bed', 'bed'], ['Wipe Kitchen Counters', 'counter'], ['Empty the Dishwasher', 'dishwasher'], ['Wash the dishes', 'dishes'],
      // ...and the new ones don't take over these
      ['Dust the coffee table', 'dust'], ['Wash the Bath Mat', 'bathmat'], ['Vacuum the couches', 'vacuum'], ['Fluff the couch cushions', 'sofa'], ['Take Out the Trash', 'trash'],
    ];
    expect(cases.map(([name]) => [name, suggestTaskIcon(name)])).toEqual(cases);
  });
});

// ENH-17: each new icon, from a chore name in each language (en fr de es it nl)
const NEW_ICON_NAMES: Record<string, string[]> = {
  dishwasher: ['Clean the dishwasher filter', 'Vider le lave-vaisselle', 'Geschirrspüler ausräumen', 'Vaciar el lavavajillas', 'Svuotare la lavastoviglie', 'Vaatwasser uitruimen'],
  grill: ['Clean the grill', 'Nettoyer le barbecue', 'Grill sauber machen', 'Limpiar la parrilla', 'Pulire la griglia', 'Barbecue schoonmaken'],
  coffee: ['Descale the coffee maker', 'Détartrer la cafetière', 'Kaffeemaschine entkalken', 'Limpiar la cafetera', 'Pulire la macchina del caffè', 'Koffiezetapparaat ontkalken'],
  wipetable: ['Wipe the dining table', 'Essuyer la table', 'Tisch abwischen', 'Limpiar la mesa', 'Pulire il tavolo', 'Tafel afnemen'],
  wheeliebin: ['Bins to the Curb', 'Sortir les poubelles', 'Mülltonnen rausstellen', 'Sacar los contenedores', 'Portare fuori i bidoni', 'Kliko aan de straat zetten'],
  boxes: ['Break Down Boxes', 'Plier les cartons', 'Kartons zerlegen', 'Desmontar las cajas de cartón', 'Appiattire gli scatoloni', 'Karton platmaken'],
  baseboard: ['Wipe the Baseboards', 'Nettoyer les plinthes', 'Fußleisten abwischen', 'Limpiar los rodapiés', 'Pulire i battiscopa', 'Plinten afnemen'],
  ceilingfan: ['Dust the Ceiling Fan', 'Dépoussiérer le ventilateur', 'Deckenventilator abstauben', 'Limpiar el ventilador de techo', 'Pulire il ventilatore', 'Plafondventilator afstoffen'],
  stairs: ['Vacuum the Stairs', "Aspirer l'escalier", 'Treppe saugen', 'Barrer las escaleras', 'Pulire le scale', 'De trap stofzuigen'],
  door: ['Wipe the Front Door', "Nettoyer l'entrée", 'Haustür putzen', 'Barrer la entrada', "Pulire l'ingresso", 'Voordeur schoonmaken'],
  timer: ['⏱️ 10-Minute Room Rescue', 'Rangement de 10 minutes', '10 Minuten aufräumen', 'Ordenar 10 minutos', 'Riordino di 10 minuti', '10 minuten opruimen'],
  gutter: ['Clean Gutters & Roof Drains', 'Nettoyer les gouttières', 'Dachrinne reinigen', 'Limpiar los canalones', 'Pulire le grondaie', 'Dakgoot schoonmaken'],
  waterheater: ['Flush Water Heater', 'Purger le chauffe-eau', 'Warmwasserspeicher entkalken', 'Revisar el calentador', 'Controllare lo scaldabagno', 'Boiler ontkalken'],
  pressurewasher: ['Pressure-Wash the Driveway', 'Terrasse au nettoyeur haute pression', 'Terrasse mit dem Hochdruckreiniger', 'Limpiar el patio con la hidrolimpiadora', "Lavare il vialetto con l'idropulitrice", 'Terras met de hogedrukreiniger'],
  paint: ['Repaint the Fence', 'Repeindre les volets', 'Zaun streichen', 'Pintar la valla', 'Pitturare la ringhiera', 'Hek verven'],
  fireplace: ['Clean Out the Fireplace', 'Ramoner la cheminée', 'Kamin reinigen', 'Limpiar la chimenea', 'Pulire il camino', 'Open haard schoonmaken'],
  thermostat: ['Check the Thermostat', 'Régler le chauffage', 'Heizung entlüften', 'Revisar la calefacción', 'Controllare il termostato', 'Verwarming bijvullen'],
  hedge: ['Trim Bushes & Hedges', 'Tailler la haie', 'Hecke schneiden', 'Podar el seto', 'Potare la siepe', 'Heg knippen'],
  leafblower: ['Leaf blower on the patio', 'Passer le souffleur', 'Laubbläser im Hof', 'Pasar el soplador de hojas', 'Usare il soffiatore', 'Bladblazer gebruiken'],
  garden: ['Weed the Vegetable Garden', 'Arroser le potager', 'Gemüsebeet gießen', 'Regar el huerto', "Innaffiare l'orto", 'Moestuin wieden'],
  chickens: ['Feed the Chickens', 'Nourrir les poules', 'Hühner füttern', 'Dar de comer a las gallinas', 'Dare da mangiare alle galline', 'Kippen voeren'],
  birdcage: ['Clean the Bird Cage', "Nettoyer la cage de l'oiseau", 'Vogelkäfig sauber machen', 'Limpiar la jaula del pájaro', 'Pulire la gabbia degli uccellini', 'Vogelkooi schoonmaken'],
  smallpet: ['Clean the Hamster Cage', 'Nettoyer la cage du lapin', 'Meerschweinchen füttern', 'Limpiar la jaula del conejo', 'Pulire la gabbia del criceto', 'Konijnenhok uitmesten'],
  reptile: ['Mist the Lizard Tank', 'Nettoyer le terrarium', 'Schildkröte füttern', 'Dar de comer a la tortuga', 'Pulire il terrario', 'Hagedis voeren'],
  horse: ['Muck Out the Horse Stall', 'Brosser le cheval', 'Pferd putzen', 'Cepillar al caballo', 'Pulire la stalla', 'Paard poetsen'],
  baby: ['Wash Baby Bottles', 'Laver les biberons', 'Windeln auffüllen', 'Cambiar el pañal', 'Comprare i pannolini', 'Luiers bijvullen'],
  medicine: ['Take Your Medicine', 'Prendre ses médicaments', 'Medikamente nehmen', 'Tomar las pastillas', 'Prendere le medicine', 'Medicijnen innemen'],
  music: ['Piano Practice (15 min)', 'Travailler le piano', 'Klavier üben', 'Practicar guitarra', 'Esercizi di chitarra', 'Gitaar oefenen'],
  sports: ['Soccer Practice', 'Entraînement de foot', 'Fußballtraining', 'Entrenamiento de fútbol', 'Allenamento di calcio', 'Voetbaltraining'],
  bath: ['Bath Time', "L'heure du bain", 'Badezeit', 'Hora del baño', 'Fare il bagnetto', 'Badtijd'],
  morning: ['Morning Routine', 'Routine du matin', 'Morgenroutine', 'Rutina de la mañana', 'Routine del mattino', 'Ochtendroutine'],
  screentime: ['Screens Off by 8', "Temps d'écran fini", 'Bildschirmzeit vorbei', 'Tiempo de pantalla', 'Spegnere lo schermo', 'Schermtijd voorbij'],
};

describe('More chore icons (ENH-17)', () => {
  it('suggests each new icon from a chore name in every language', () => {
    const got = Object.fromEntries(Object.keys(NEW_ICON_NAMES).map((k) => [k, NEW_ICON_NAMES[k].map((n) => suggestTaskIcon(n))]));
    expect(got).toEqual(Object.fromEntries(Object.keys(NEW_ICON_NAMES).map((k) => [k, NEW_ICON_NAMES[k].map(() => k)])));
    expect(Object.keys(NEW_ICON_NAMES).every((k) => (TASK_ICON_KEYS as readonly string[]).includes(k))).toBe(true);
  });

  it("gives our family's stand-in chores their own icon", () => {
    const cases: Array<[string, string]> = [
      ['Bins to the Curb', 'wheeliebin'], ['Bring the Bins Back', 'wheeliebin'], ['Break Down Boxes & Sort Recycling', 'boxes'],
      ['Flush Water Heater', 'waterheater'], ['✂️ Trim Bushes & Hedges', 'hedge'], ['💦 Pressure-Wash the Patio or Driveway', 'pressurewasher'],
      ['Clean Dishwasher Filter & Disposal', 'dishwasher'], ['⏱️ Living Room 10-Minute Tidy', 'timer'], ['🚀 Starter: up · lights on · dressed', 'morning'],
      ['Kitchen Trash & Recycling Out', 'trash'],
    ];
    expect(cases.map(([name]) => [name, suggestTaskIcon(name)])).toEqual(cases);
  });

  it('every icon has a name in all six languages, and the new Family group too', () => {
    const missing: string[] = [];
    for (const lang of ['en', 'fr', 'de', 'es', 'it', 'nl']) {
      const ui = JSON.parse(readFileSync(join(__dirname, '../../../client/src/i18n', `${lang}.json`), 'utf8')).ui;
      for (const k of TASK_ICON_KEYS) if (!ui.taskIcons?.[k]) missing.push(`${lang}: taskIcons.${k}`);
      if (!ui.iconGroups?.family) missing.push(`${lang}: iconGroups.family`);
    }
    expect(missing).toEqual([]);
  });
});
