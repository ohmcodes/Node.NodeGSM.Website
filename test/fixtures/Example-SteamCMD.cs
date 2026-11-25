using System;
using System.Diagnostics;
using System.Threading.Tasks;
using WindowsGSM.Functions;
using WindowsGSM.GameServer.Engine;
using WindowsGSM.GameServer.Query;

namespace WindowsGSM.Plugins
{
    // public Plugin Plugin = new Plugin { name = "WRONG (comment)", author = "Nobody" };
    public class Palgame : SteamCMDAgent
    {
        /* version = "9.9" -- also only a comment */
        public Plugin Plugin = new Plugin
        {
            name = "WindowsGSM.Palgame",
            author = "ExampleAuthor",
            description = "A \"quoted\" description with {braces} and a // fake comment",
            version = "1.2",
            url = "https://example.com/palgame",
            color = "#1e8" + "449"
        };

        public Palgame(ServerConfig serverData) : base(serverData) => base.serverData = _serverData = serverData;
        private readonly ServerConfig _serverData;

        public override bool loginAnonymous => true;
        public override string AppId => "123456";

        public override string StartPath => @".\Pal\Binaries\Win64\PalServer.exe";
        public string FullName = "Palgame Dedicated Server";
        public bool AllowsEmbedConsole = true;
        public int PortIncrements = 2;
        public object QueryMethod = new A2S();

        public string Port = "8211";
        public string QueryPort = "8212";
        public string Defaultmap = "MainWorld";
        public string Maxplayers = "32";
        public string Additional = "-log";

        public async Task<Process> Start()
        {
            string shipExePath = ServerPath.GetServersServerFiles(_serverData.ServerID, StartPath);
            string param = $"-port={_serverData.ServerPort} -queryport={_serverData.ServerQueryPort} -players={_serverData.ServerMaxPlayer}";
            param += string.IsNullOrWhiteSpace(_serverData.ServerIP) ? string.Empty : $" -publicip={_serverData.ServerIP}";
            param += $" -servername=\"{_serverData.ServerName}\" {_serverData.ServerParam}";

            Process p = new Process
            {
                StartInfo =
                {
                    FileName = shipExePath,
                    Arguments = param,
                    WindowStyle = ProcessWindowStyle.Minimized,
                    UseShellExecute = false
                },
                EnableRaisingEvents = true
            };
            p.Start();
            return p;
        }

        public async Task Stop(Process p)
        {
            await Task.Run(() =>
            {
                p.StandardInput.WriteLine("quit");
            });
        }
    }
}
