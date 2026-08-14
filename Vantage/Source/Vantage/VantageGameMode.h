#pragma once

#include "CoreMinimal.h"
#include "Engine/EngineTypes.h"
#include "GameFramework/GameModeBase.h"
#include "VantageGameMode.generated.h"

class APlayerStart;

/**
 * Owns the run - waves, kills, death and restart - and assembles the map.
 *
 * The map has to exist before the player pawn spawns, or the player is dropped
 * into an empty world with no ground. Rather than trust a single hook to fire
 * early enough, EnsureLevelBuilt() is idempotent and called from three places,
 * in increasing order of desperation:
 *
 *   1. InitGame                - normal path, runs while the map is still empty
 *   2. ChoosePlayerStart       - guaranteed to run before the pawn is spawned
 *   3. StartPlay               - last resort, if both of the above were skipped
 *
 * Only the first one that runs does any work.
 */
UCLASS()
class VANTAGE_API AVantageGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AVantageGameMode();

	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
	virtual void StartPlay() override;

	int32 GetWave() const { return Wave; }
	int32 GetKills() const { return Kills; }
	int32 GetZombiesAlive() const { return ZombiesAlive; }
	bool IsPlayerDown() const { return bPlayerDown; }

	/** True between waves. The HUD counts the break down. */
	bool IsBetweenWaves() const { return bBetweenWaves; }
	float GetSecondsToNextWave() const;

	/** Where the player entered. Also used to recover anyone who falls out. */
	FVector GetSpawnLocation() const { return SpawnLocation; }

	/** Called by a zombie as it dies. */
	void NotifyZombieKilled();

	/** Called by the player character when its health reaches zero. */
	void NotifyPlayerDown();

private:
	void EnsureLevelBuilt();

	void StartWave(int32 WaveNumber);
	void BeginIntermission();
	void OnIntermissionElapsed();

	/** Spawns one zombie on a ring around the arena, clear of the player. */
	void SpawnZombie(int32 Seed);

	void RestartRun();

	UPROPERTY(EditDefaultsOnly, Category = "Vantage")
	float IntermissionSeconds = 6.f;

	/** Wave N fields this many shamblers. */
	UPROPERTY(EditDefaultsOnly, Category = "Vantage")
	int32 BaseWaveSize = 4;

	UPROPERTY(Transient)
	TObjectPtr<APlayerStart> SpawnPoint;

	FVector SpawnLocation = FVector(0.f, 0.f, 140.f);

	FTimerHandle IntermissionTimer;
	FTimerHandle RestartTimer;

	bool bLevelBuilt = false;
	bool bBetweenWaves = false;
	bool bPlayerDown = false;
	int32 Wave = 0;
	int32 Kills = 0;
	int32 ZombiesAlive = 0;
	int32 SpawnSalt = 1;
};
