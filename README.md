# 3B Model Görüntüleyici (Windows .exe)

FBX, glTF/GLB, OBJ ve STL modelleri için modern, karanlık temalı masaüstü 3B görüntüleyici.
Windows 3D Viewer'ın kolaylığını temel alır; gelişmiş gölgelendirme, aydınlatma, materyal ve
sahne inceleme araçları ekler. Sonuç, çift tıklayınca açılan **tek bir `ModelViewer3D.exe`** dosyasıdır.

## Hızlı başlangıç — exe üretmek

### Yöntem A: Kendi Windows bilgisayarında (tek komut)

1. [Python 3.13](https://www.python.org/downloads/windows/) kurun ("Add python.exe to PATH" işaretli).
2. Proje klasöründe `build_exe.bat` dosyasına çift tıklayın (veya komut isteminde çalıştırın).
3. 5–10 dakika sonra çıktı hazır olur: **`dist\ModelViewer3D.exe`**

```bat
build_exe.bat           :: tek dosya:  dist\ModelViewer3D.exe   (taşınabilir, ~150 MB)
build_exe.bat onedir    :: klasör:     dist\ModelViewer3D\      (daha hızlı açılır)
```

Betik sırasıyla şunları yapar: uygun Python'u bulur → `.venv` sanal ortamını kurar →
`requirements.txt` + PyInstaller'ı yükler → ikonu üretir → `ModelViewer3D.spec` ile derler.

### Yöntem B: GitHub Actions (Windows bilgisayar gerekmez)

1. Bu klasörü bir GitHub deposuna gönderin (`git push`).
2. **Actions** sekmesinde "Windows EXE" iş akışı otomatik çalışır.
3. Bittiğinde çalıştırmanın sayfasındaki **Artifacts → ModelViewer3D-windows** zip'inden exe'yi indirin.
4. `git tag v1.0.0 && git push --tags` ile etiket gönderirseniz exe ayrıca bir **Release**'e eklenir.

> Not: Tek dosya exe her açılışta kendini geçici klasöre açtığı için ilk açılış birkaç saniye
> sürebilir. Bazı antivirüsler PyInstaller ile üretilmiş imzasız exe'leri yanlışlıkla işaretleyebilir;
> böyle bir durumda `onedir` modunu tercih edin.

## macOS'ta çalıştırma

Finder'da **`run_mac.command`** dosyasına çift tıklayın. İlk açılışta Python 3.13 ile `.venv` sanal
ortamını kurar (birkaç dakika), sonraki açılışlar doğrudan başlar. Python 3.10–3.13 yoksa:
`brew install python@3.13`. Terminalden model ve seçenek de verebilirsiniz:

```bash
./run_mac.command ~/Downloads/model.fbx
```

## Kaynak koddan çalıştırma (Windows, geliştirme)

```bat
py -3.13 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
run.bat                     :: veya:  .venv\Scripts\python main.py model.fbx
```

Komut satırı seçenekleri:

| Seçenek | Açıklama |
|---|---|
| `model.fbx` | Açılışta yüklenecek dosya ("Birlikte aç" ile de çalışır) |
| `--shading wire` | Başlangıç modu: `lit`, `litwire`, `wire`, `unlit`, `clay`, `normals`, `uv`, `vcolor` |
| `--capture cikti.png` | Modeli yükle, ekran görüntüsünü kaydet ve çık (toplu küçük resim üretimi) |
| `--render-mode MOD` | Görüntüleme motoru: `auto` (GPU / Direct3D 11) veya `software` (yazılımsal, CPU) |
| `--software-gl` | `--render-mode software` kısayolu |
| `--profile ad` | Ayrı bir ayar profili kullan |
| `--debug` | Ayrıntılı günlük + geliştirici araçları |

Örnek modeller üretmek için: `python tools/make_test_models.py samples`

## Özellikler

**Dosya desteği**
- `.fbx`: Binary ve ASCII (FBX 7.x). Çoklu alt-mesh, Phong/PBR materyaller, katmanlı normal/UV,
  smoothing, vertex color, iskelet, morph ve anahtar kare animasyonları, gömülü dokular.
- `.glb` / `.gltf`: İskelet ve morph animasyonları, Draco, Meshopt ve KTX2 sıkıştırma.
- `.obj` (+ `.mtl` ve dokular), `.stl` (binary/ASCII, Z-yukarı otomatik düzeltilir). Ek olarak `.ply`, `.dae`, `.3mf`.
- **Akıllı doku bulma:** Model içindeki mutlak Windows yolları (`C:\Users\...\wood.tga`), `..\textures\`
  gibi göreli yollar veya yanlış uzantılar; model klasörü, alt klasörleri (`textures`, `maps`, `*.fbm` …)
  ve üst klasör dosya adına göre taranarak çözülür. **TIF, PSD ve DDS** dokuları otomatik PNG'ye çevrilir.

**Gölgelendirme modları** (üst araç çubuğu, sağ panel, *Görüntüle* menüsü veya `1–7` tuşları)

1. **Işıklı (Lit):** Işık, gölge, specular/shininess ve dokular dahil tam görünüm.
2. **Işıklı tel kafes:** Dokulu yüzeyin üzerine derinlik ofsetli, keskin tel kafes. Çizgi rengi, kalınlığı (piksel) ve opaklığı ayarlanabilir.
3. **Tel kafes (unlit):** Yalnızca üçgen kenarları. Gizli çizgiler kaldırılır, istenirse X-Ray ile tümü gösterilir.
4. **Işıksız (Albedo):** Yalnızca ham doku ve taban rengi.
5. **Kil / Matcap:** Işıklı kil ya da 6 matcap (gri kil, kırmızı mum, yeşim, ten, krom, altın).
6. **Teknik:** Normal haritası (vertex/poligon normalleri, normal vektör çizgileri), UV dama testi, vertex rengi.
   UV dama hücreleri A0–H7 etiketli ve ↑ oklu: ok aşağı bakıyorsa UV dikeyde ters, etiket aynalıysa yatayda
   ters çevrilmiştir. Seçili parçanın UV yerleşimi panelde +U / +V yön işaretleriyle gösterilir.
7. **Rastgele materyal renkleri:** Her materyale (veya parçaya) ayırt edilebilir bir renk verir; `7` ile her
   basışta yeni renkler. Dokusuz modeller açılışta otomatik olarak bu modda gelir (panelden kapatılabilir).

Tel kafes, barycentric koordinatlı özel bir gölgelendirici ile çizilir. Bu sayede kalınlık ayarı
Windows'ta da çalışır ve katman iskelet/morph animasyonlarını birebir takip eder.

**Kamera:** Sol tık = yörünge, orta tık veya Shift+Sol = kaydırma, tekerlek veya sağ tık sürükle = yakınlaşma.
Yakın/uzak kırpma düzlemleri model boyutuna göre dinamik ayarlanır. `F`/`Home` = ekrana sığdır.
Standart görünümler ve ortografik kamera (`P`) desteklenir. Sağ alttaki eksen göstergesindeki bir eksene
tıklayınca kamera o yöne döner. Modeller açılışta X ekseninde −90° döndürülür (Z-yukarı dışa aktarımlar
için); *Araçlar › Açılışta Döndür* veya panelden değiştirilebilir.

**Ortam ve aydınlatma:** Önizlemeli 3×3 tema ızgarası (9 tema). Düz, doğrusal, radyal veya ortam haritası
arka planı ve hızlı arka plan önayarları. Güneş ikonlu 360° ışık kadranı (azimut ve yükseklik). Işık rengi
ve şiddeti, ortam rengi ve faktörü, dolgu ve kenar ışıkları, yansıma yoğunluğu, pozlama ve ton eşleme.
Gölge yakalayıcı zemin. *Ayarları kaydet / yükle* (JSON).

**Materyal ve sahne:** Dokuları aç/kapat (`T`). Diffuse, specular, shininess/roughness, metalness,
opaklık, emissive ve normal/bump etkisi kaydırıcıları. Doku değiştirme/kaldırma ve materyali sıfırlama.
Bir `.png/.jpg/.tga` dosyasını modelin üzerine **sürükleyip bırakınca** doku o parçaya atanır.
Sahne ağacı üç şekilde gruplanabilir: **Hiyerarşi** (dosyadaki üst nesneler), **Materyal** (aynı materyali
kullanan parçalar) ve **Ad** (`Plane.001`, `Plane.002` → *Plane* klasörü). Klasör satırına tıklamak tüm grubu seçer.
Blender kısayolları: `H` seçiliyi gizle, `Shift+H` seçili dışındakileri gizle, `Alt+H` hepsini geri getir.
(FBX, Blender koleksiyonlarını taşımaz; klasör yapısı için nesneleri bir Empty altına bağlayın ya da Materyal/Ad
gruplamasını kullanın.) İstatistikler: benzersiz vertex, üçgen, kenar, materyal, doku, kemik, animasyon,
BBoxMin/BBoxMax, boyutlar.

**Animasyon çubuğu:** Oynat/duraklat (`Boşluk`), döngü, kare adımı (`←/→`), zaman çizelgesi,
animasyon seçici, hız (×0.25 … ×2).

**Dosya menüsü:** Aç, son açılanlar, yeniden yükle, ekran görüntüsü (normal ya da şeffaf arka plan),
panoya kopyala. Tüm kısayollar: *Yardım › Klavye Kısayolları* (`F1`).

## Mimari

```
main.py                     giriş noktası
viewer3d/
  app.py                    komut satırı, Chromium bayrakları, Qt uygulaması
  main_window.py            QMainWindow, menüler, sürükle-bırak, dosya iletişim kutuları
  bridge.py                 JS ↔ Python köprüsü (yerel sunucunun /api uç noktası üzerinden)
  server.py                 127.0.0.1 üzerinde yerel varlık sunucusu + akıllı doku çözümleme
  theme.py, platform_win.py koyu Qt teması, koyu Windows başlık çubuğu
web/
  index.html, css/app.css   arayüz (panel, araç çubukları, animasyon çubuğu)
  js/viewer.js              sahne, kamera, ızgara, seçim, ekran görüntüsü
  js/loader.js              FBX / glTF / OBJ / STL / PLY / DAE / 3MF yükleyicileri
  js/shading.js             8 gölgelendirme modu, tel kafes katmanı, materyal yönetimi
  js/environment.js         temalar, ışık düzeni, ortam haritası, gölgeler
  js/animation.js, stats.js animasyon oynatıcı, istatistikler
  js/ui/*                   sağ panel, ışık kadranı, HUD, animasyon çubuğu
  vendor/three/             gömülü Three.js r170 (çevrimdışı çalışır)
tools/                      ikon ve örnek model üreticileri
ModelViewer3D.spec          PyInstaller yapılandırması
build_exe.bat               tek komutla exe derleme
```

Pencere, menüler ve dosya iletişim kutuları **PySide6 (Qt 6)** ile yazılmış yerel Windows
bileşenleridir. 3B görüntü alanı, Qt'nin gömülü Chromium motorunda (**QtWebEngine, WebGL 2 /
Direct3D 11**) çalışan **Three.js** ile çizilir. Bu motor, FBX/glTF için en olgun açık kaynak
yükleyicilerini içerir. Uygulama internet gerektirmez; tüm dosyalar exe'nin içindedir.

## Sorun giderme

- **3B alan açılmıyor, "Model Aç" tepki vermiyor:** Uygulama, 3B motor 20 saniye içinde başlamazsa
  yazılımsal görüntüleme moduna geçmeyi önerir ve kendini yeniden başlatır (GPU'su olmayan veya
  sürücüsü sorunlu bilgisayarlar, sanal makineler). Modu elle seçmek için *Araçlar › Görüntüleme Motoru* menüsünü ya da `--render-mode` seçeneğini
  kullanın. Seçilen mod kaydedilir. Ekran kartı sürücüsünü güncellemek de çoğu zaman sorunu çözer.
- **Doku görünmüyor:** Dokuları modelle aynı klasöre ya da `textures` alt klasörüne koyun. Eksik doku adları açılışta uyarı olarak gösterilir.
- **Model yan yatık:** *Araçlar › Modeli Döndür* menüsünü kullanın.
- **Günlükler:** `%LOCALAPPDATA%\ModelViewer3D\viewer.log` (*Yardım › Günlük Klasörünü Aç*). Başlangıçta
  kullanılan görüntüleme modu, ekran kartı (WebGL) bilgisi ve Qt/Chromium uyarıları buraya yazılır.

## Lisanslar

Three.js: MIT (`web/vendor/three/LICENSE`). PySide6/Qt: LGPLv3. Pillow: MIT-CMU.
