# Laboratorio Opus

Cinque esperimenti interattivi scritti da zero da Claude Opus 5.5.
Circa 7.000 righe di HTML, CSS, JavaScript e GLSL, **nessuna libreria esterna**.

**Provalo online:** https://viciuslio.github.io/Laboratorio-Opus-5/

| Esperimento | Cosa mostra | Tecnologia |
|---|---|---|
| **Fluido** | Equazioni di Navier–Stokes risolte in tempo reale sulla GPU | WebGL2, ~30 passaggi di shader per frame |
| **Evoluzione** | 60 auto con reti neurali che imparano a guidare per selezione naturale | Algoritmo genetico, sphere tracing, Canvas 2D |
| **Mondo** | Paesaggio infinito generato da una funzione matematica | Raymarching GLSL, ombre morbide, riflessi |
| **Armonia** | Musica generativa sintetizzata dal vivo | Web Audio, catene di Markov, ritmi euclidei, sintesi FM |
| **Corpo** | Atlante anatomico parametrico in scala reale: cuore, polmoni, cervello, sistema nervoso, esofago, stomaco, fegato, intestino, reni, più un volo dentro un vaso sanguigno | Raymarching GLSL, funzioni di distanza, kit anatomico generato da dati, cursori sano/patologico |

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

## Scaletta per una demo di 10 minuti

1. **Fluido.** Lascialo mescolare da solo, poi trascina il mouse. Abbassa le "iterazioni di pressione" a 2: il fluido smette di essere incomprimibile e diventa gommoso.
2. **Evoluzione.** All'inizio le auto sono goffe. Dopo una decina di generazioni (a 4× serve circa un minuto) completano il primo giro. Poi premi **Nuova pista**: guidano bene anche su curve mai viste, quindi hanno imparato a guidare, non il percorso a memoria. Clicca sulla pista per mettere ostacoli.
3. **Mondo.** Trascina per guardarti intorno, sposta l'ora del giorno verso il tramonto e la notte, alza il livello del mare.
4. **Armonia.** Premi "Avvia l'ascolto" e sposta la "luminosità del modo" da frigio a lidio: cambia il colore emotivo della musica, e la forma dell'accordo sul circolo delle quinte cambia con lui.
5. **Corpo.** Parti dal **cuore**: alza il battito, attiva il suono, poi porta al massimo *Ipertrofia* con il taglio coronale e guarda la parete ispessirsi. Nei **polmoni** scegli *Solo albero bronchiale* (generato con la legge di Murray) e prova *Fumo* ed *Enfisema*. Nel **sistema nervoso** premi *Comando al dito* e cambia la velocità della fibra. Nell'**esofago** premi *Deglutisci*; nello **stomaco** muovi *Riempimento*. Chiudi con il **fegato** da sano a cirrotico, i **reni** con il calcolo in sezione e il volo **dentro un vaso sanguigno**.

Ogni esperimento ha una sezione **Come funziona** nel pannello laterale.

## Il modulo Corpo, in breve

- Ogni organo è una funzione di distanza scritta in GLSL e disegnata in raymarching; niente modelli 3D né texture.
- Tubi e alberi (bronchi, nervi) sono generati in JavaScript dal *kit anatomico* e passati allo shader come dati.
- Lo shader chiama la funzione dell'organo in un solo punto e compila in parallelo: su Windows (ANGLE/Direct3D) il cambio di organo è passato da oltre un minuto a circa un secondo, e gli organi già visti si riaprono all'istante.
- I cursori sano/patologico (ipertrofia, steatosi e cirrosi, idronefrosi, enfisema, età del cervello) sono modelli visivi indicativi, non simulazioni cliniche.
