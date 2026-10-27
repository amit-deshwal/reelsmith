# RS-501/RS-1235: a word-timed fixture from macOS `say`, one word at a time (silence trimmed at -45 dB), joined with 0.28 s
# gaps after 0.5 s of silence, so each true start is exact. Writes <lang>.wav and <lang>.truth.json in the current folder.
#   python3 server/reelsmith/asr-say-fixture.py Rishi en "we climbed the hardest trek ..."
import subprocess, json, sys, os
voice, lang, words = sys.argv[1], sys.argv[2], sys.argv[3].split()
SR=16000; gap=0.28; t=0.5; parts=[]; truth=[]
silence=lambda d,n: subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i',f'anullsrc=r={SR}:cl=mono','-t',str(d),n],check=True)
silence(0.5,'s0.wav'); parts.append('s0.wav'); silence(gap,'gap.wav')
for i,w in enumerate(words):
    subprocess.run(['say','-v',voice,'-o',f'w{i}.aiff',w],check=True)
    # trim leading/trailing silence so the true start is exact
    subprocess.run(['ffmpeg','-v','error','-y','-i',f'w{i}.aiff','-ar',str(SR),'-ac','1','-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',f'w{i}.wav'],check=True)
    d=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'w{i}.wav']))
    truth.append({'word':w,'start':round(t,3)}); parts+= [f'w{i}.wav','gap.wav']; t+=d+gap
open('list.txt','w').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i','list.txt','-ar',str(SR),'-ac','1',f'{lang}.wav'],check=True)
json.dump(truth,open(f'{lang}.truth.json','w'),ensure_ascii=False)
print(lang, len(truth), 'words', round(t,1),'s')
