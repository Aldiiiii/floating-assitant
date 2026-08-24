; Hook NSIS untuk installer floating-assistant.
; Didaftarkan lewat bundle.windows.nsis.installerHooks di tauri.conf.json.

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean uninstall (keputusan user: opsi A — selalu bersih tanpa dialog).
  ; Menghapus semua data aplikasi: model voice/STT, riwayat percakapan,
  ; settings, cache audio, dan sisa profil WebView2.
  RMDir /r "$APPDATA\com.localai.assistant"
  RMDir /r "$LOCALAPPDATA\com.localai.assistant"
!macroend
