# EVE Online Probe Scanner Signature Results Reference

This reference document outlines the structure of signature scan results pasted from the EVE Online client, lists the localized valid signature category names across all client languages, and provides representative examples of raw scanner pastes.

---

## 1. Column Structure & Data Fields

When copy-pasting from the EVE Online Probe Scanner window, the clipboard receives a list of rows with fields separated by **Tab characters (`\t`)**.

The columns always appear in the following order:

| Column # | Field Name          | Description / Example                                                                                                        |
| :------: | :------------------ | :--------------------------------------------------------------------------------------------------------------------------- |
|  **1**   | **ID**              | Unique 3-letter, 3-number identifier (e.g., `AXP-378`)                                                                       |
|  **2**   | **Class**           | Signature classification (e.g., `Cosmic Signature` or `Cosmic Anomaly`)                                                      |
|  **3**   | **Group**           | The broad archetype, empty if scan strength is low (e.g., `Wormhole`, `Relic Site`, `Ore Site`)                              |
|  **4**   | **Type / Name**     | The specific site name, empty if scan strength is < 100% (e.g., `Unstable Wormhole`, `Forgotten Perimeter Habitation Coils`) |
|  **5**   | **Signal Strength** | The current scan resolution percentage (e.g., `0.0%`, `35.5%`, `100.0%`)                                                     |
|  **6**   | **Distance**        | Absolute distance from the scanning ship (e.g., `8.35 AU`)                                                                   |

> [!NOTE]
> When pasting into the application, the parser must expect tabs (`\t`) as the standard delimiter

---

## 2. Localized Valid Signature Categories

Aperture filters out unrelated scanner lines by matching the **Class** column against a list of acceptable category names. Because players run EVE Online in multiple languages, these category names are localized by the EVE client.

Below is the mapping of valid signature and anomaly category names across all officially supported languages:

| Language Code | Language          | Cosmic Anomaly (Localized) | Cosmic Signature (Localized) |
| :-----------: | :---------------- | :------------------------- | :--------------------------- |
|    **en**     | English           | `Cosmic Anomaly`           | `Cosmic Signature`           |
|    **de**     | German (Deutsch)  | `Kosmische Anomalie`       | `Kosmische Signatur`         |
|    **fr**     | French (Français) | `Anomalie cosmique`        | `Signature cosmique`         |
|    **ru**     | Russian (Русский) | `Космическая аномалия`     | `Скрытый сигнал`             |
|    **ja**     | Japanese (日本語) | `宇宙の特異点`             | `宇宙のシグネチャ`           |
|    **zh**     | Chinese (中文)    | `异常空间`                 | `空间信号`                   |

---

## 3. Raw Scan Paste Examples & Progression States

During scanning, a signature's information is revealed incrementally as signal strength increases. The following examples represent typical raw pastes at different stages of the scanning workflow.

### Case A: Initial Scan (0.0% Signal)

At this stage, only the signature ID and the classification Kind are known. Group and Name are blank.

_Raw Tab-Separated Paste:_

```text
AXP-378	Cosmic Signature			0.0%	8.35 AU
BIF-460	Cosmic Signature			0.0%	10.89 AU
KFE-716	Cosmic Signature			0.0%	15.21 AU
QXX-268	Cosmic Signature			0.0%	17.57 AU
```

---

### Case B: Partial Scan (Group Discovered, < 100% Signal)

As the scan resolves, the client populates the **Group** column (e.g., `Wormhole` or `Relic Site`), but the specific site **Type / Name** remains blank.

_Raw Tab-Separated Paste:_

```text
AXP-378	Cosmic Signature			0.0%	8.35 AU
BIF-460	Cosmic Signature	Relic Site		35.5%	10.69 AU
KFE-716	Cosmic Signature				0.0%	15.21 AU
QXX-268	Cosmic Signature	Wormhole	55.0%	12.50 AU
UNO-708	Cosmic Signature	Wormhole Unstable Wormhole 100.0% 17.43 AU
```

---

### Case C: Complete Scan (100% Signal)

Once signal strength reaches `100.0%`, the exact **Type / Name** of the site is revealed, and the signature can be warped to or mapped.

_Raw Tab-Separated Paste:_

```text
AXP-378 Cosmic Signature 0.0% 8.36 AU
BIF-460 Cosmic Signature Relic Site Forgotten Perimeter Habitation Coils 100.0% 10.67 AU
KFE-716 Cosmic Signature 0.0% 15.21 AU
QXX-268 Cosmic Signature Wormhole 0.0% 11.57 AU
UNO-708 Cosmic Signature Wormhole Unstable Wormhole 100.0% 17.43 AU
```

---

### Case D: Cosmic Anomalies (Always 100% Signal)

Cosmic Anomalies do not require probing and are always visible at `100.0%` strength, revealing their Group and Name immediately.

_Raw Tab-Separated Paste:_

```text
ASE-500 Cosmic Anomaly Ore Site Ordinary Perimeter Deposit 100.0% 14.55 AU
```
