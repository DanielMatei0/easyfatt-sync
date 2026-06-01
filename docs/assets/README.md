# Asset documentazione

Questa cartella è riservata a risorse visive per la documentazione:

- screenshot dell’interfaccia;
- diagrammi di architettura;
- icone o export per manuali PDF.

Al momento non contiene file binari: i riferimenti nel testo usano percorsi relativi verso `assets/icon.png` nel progetto principale.

**Convenzione suggerita per nuovi file:**

```
docs/assets/
  ui-main-settings.png
  ui-google-connect.png
  architecture-diagram.png
```

Nei file Markdown, collega le immagini così:

```markdown
![Impostazioni principali](../assets/ui-main-settings.png)
```
