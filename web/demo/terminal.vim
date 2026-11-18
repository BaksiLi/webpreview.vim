set nocompatible
let s:terminal = term_start([v:progpath, '-Nu', $DEMO_SCRIPT.'/vimrc', '-V1vim.log', '-i', 'NONE', '-n', $DEMO_FILE],
      \ {'hidden': 1, 'term_rows': 24, 'term_cols': 60})
while term_getstatus(s:terminal) !~# 'finished'
  call term_wait(s:terminal, 30)
  if !filereadable('request') | continue | endif
  let s:request = json_decode(readfile('request')[0])
  call delete('request')
  if has_key(s:request, 'keys')
    call term_sendkeys(s:terminal, s:request.keys)
  else
    let s:rows = map(range(1, 24), {_, row -> term_scrape(s:terminal, row)})
    call writefile([json_encode({'rows': s:rows, 'cursor': term_getcursor(s:terminal)})], 'screen.tmp')
    call rename('screen.tmp', 'screen.json')
  endif
endwhile
qall!
