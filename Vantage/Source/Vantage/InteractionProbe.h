#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "InteractionProbe.generated.h"

class AVantageCharacter;

/**
 * Traces forward from the owning pawn's view point each frame and remembers
 * which IInteractable, if any, is currently under the crosshair. The HUD reads
 * the result to draw a prompt; the character reads it to service the key press.
 */
UCLASS(ClassGroup = (Vantage), meta = (BlueprintSpawnableComponent))
class VANTAGE_API UInteractionProbe : public UActorComponent
{
	GENERATED_BODY()

public:
	UInteractionProbe();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** The focused actor, or nullptr. Guaranteed to implement IInteractable. */
	AActor* GetFocusedActor() const { return FocusedActor.Get(); }

	/** Prompt for the focused actor, or empty text when nothing is focused. */
	FText GetFocusedPrompt() const;

	/** True when something is focused but its own CanInteract() said no. */
	bool IsFocusLocked() const { return bFocusLocked; }

	/** How far in front of the eyes we look, in centimetres. */
	UPROPERTY(EditAnywhere, Category = "Vantage")
	float Reach = 340.f;

private:
	TWeakObjectPtr<AActor> FocusedActor;
	bool bFocusLocked = false;
};
