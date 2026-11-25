using System.Diagnostics;
using System.Text;
using WindowsGSM.Functions;

namespace WindowsGSM.Plugins
{
    public class Concat
    {
        public Plugin Plugin = new Plugin { name = "Concat", author = "x", description = "d", version = "2" };
        public Concat(ServerConfig serverData) => _serverData = serverData;
        private readonly ServerConfig _serverData;
        public string StartPath { get { return "bin/server.exe"; } }
        public string FullName => "Concat Server";
        public bool AllowsEmbedConsole = false;
        public object QueryMethod = null;
        public string Port = "27015"; public string QueryPort = "27016"; public string Maxplayers = "16";

        public async Task<Process> Start()
        {
            var sb = new StringBuilder();
            sb.Append("-console ");
            sb.Append("-ip " + _serverData.ServerIP + " ");
            sb.Append("-port " + _serverData.ServerPort);
            sb.Append(" +maxplayers " + _serverData.ServerMaxPlayer + " " + _serverData.ServerParam);
            var p = new Process { StartInfo = { FileName = StartPath, Arguments = sb.ToString() } };
            p.Start();
            return p;
        }
        public async Task Stop(Process p) { await Task.Run(() => { ServerConsole.SendMessageToMainWindow(p.MainWindowHandle, "quit"); }); }
    }
}
