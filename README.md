# Laboratorio Opus

Cinque esperimenti interattivi scritti da zero da Claude Opus 5.5.
Circa 3.900 righe di HTML, CSS, JavaScript e GLSL, **nessuna libreria esterna**.

**Provalo online:** https://viciuslio.github.io/Laboratorio-Opus-5/

| Esperimento | Cosa mostra | Tecnologia |
|---|---|---|
| **Fluido** | Equazioni di Navier–Stokes risolte in tempo reale sulla GPU | WebGL2, ~30 passaggi di shader per frame |
| **Evoluzione** | 60 auto con reti neurali che imparano a guidare per selezione naturale | Algoritmo genetico, sphere tracing, Canvas 2D |
| **Mondo** | Paesaggio infinito generato da una funzione matematica | Raymarching GLSL, ombre morbide, riflessi |
| **Armonia** | Musica generativa sintetizzata dal vivo | Web Audio, catene di Markov, ritmi euclidei, sintesi FM |
| **Corpo** | Volo dentro un vaso sanguigno di 50 µm, in scala reale | Raymarching GLSL, domain repetition, flusso di Poiseuille |

## Come aprirlo

Doppio clic su `index.html` (Chrome, Edge, Firefox o Safari recenti).
Serve una connessione a internet solo per i caratteri tipografici.

In alternativa, da questa cartella:

```bash
python -m http.server 5173
```

e poi apri http://localhost:5173

## Scorciatoie

- `1`–`5`: cambia esperimento
- `H`: modalità presentazione (nasconde l'interfaccia)
- `F`: schermo intero

## Scaletta per una demo di 6 minuti

1. **Fluido.** Lascialo mescolare da solo, poi trascina il mouse. Abbassa le "iterazioni di pressione" a 2: il fluido smette di essere incomprimibile e diventa gommoso.
2. **Evoluzione.** All'inizio le auto sono goffe. Dopo una decina di generazioni (a 4× serve circa un minuto) completano il primo giro. Poi premi **Nuova pista**: guidano bene anche su curve mai viste, quindi hanno imparato a guidare, non il percorso a memoria. Clicca sulla pista per mettere ostacoli.
3. **Mondo.** Trascina per guardarti intorno, sposta l'ora del giorno verso il tramonto e la notte, alza il livello del mare.
4. **Armonia.** Premi "Avvia l'ascolto" e sposta la "luminosità del modo" da frigio a lidio: cambia il colore emotivo della musica, e la forma dell'accordo sul circolo delle quinte cambia con lui.
5. **Corpo.** Attiva "Suono del battito" e alza il battito cardiaco: pareti e flusso pulsano insieme all'elettrocardiogramma. Poi passa al "Microscopio elettronico" per la classica vista a falsi colori. Nel pannello, il profilo di Poiseuille mostra perché i globuli al centro sorpassano quelli vicino alle pareti.

Ogni esperimento ha una sezione **Come funziona** nel pannello laterale.
